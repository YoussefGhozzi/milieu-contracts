import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiProblem, createMilieuApi, invalidationsFor, memoryTokenStore, problemMessage, queryKeys } from './index';

type Handler = (req: { method: string; url: string; headers: Record<string, string>; body: unknown }) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }> | 'network';

/** Faux serveur : enregistre chaque requête et répond avec `handler`. */
function fakeServer(handler: Handler) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const req = { method: init.method ?? 'GET', url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    const r = await handler(req);
    if (r === 'network') throw new TypeError('Failed to fetch');
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

const problem = (status: number, code: string, detail = code, extra: object = {}) => ({ status, body: { type: 'about:blank', title: code, status, code, detail, ...extra } });
const session = (n: number) => ({ tokenType: 'Bearer', accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900, refreshExpiresAt: new Date().toISOString(), account: {} });

describe('client de l’API', () => {
  it('URL, jeton d’accès et paramètres de requête', async () => {
    const s = fakeServer(() => ({ status: 200, body: { items: [] } }));
    const api = createMilieuApi(new ApiClient({ baseUrl: 'https://api.test/', tokens: memoryTokenStore({ accessToken: 'a1' }), fetch: s.fetch }));
    await api.sessions.list({ from: '2026-01-01T00:00:00Z', coachId: undefined, includeCancelled: true });
    expect(s.calls[0]!.url).toBe('https://api.test/api/v1/sessions?from=2026-01-01T00%3A00%3A00Z&includeCancelled=true');
    expect(s.calls[0]!.headers.Authorization).toBe('Bearer a1');
  });

  it('jeton expiré : un seul renouvellement pour 5 requêtes simultanées, puis elles repartent', async () => {
    let refreshes = 0;
    const s = fakeServer(async (r) => {
      if (r.url.endsWith('/auth/refresh')) { refreshes++; await new Promise((x) => setTimeout(x, 20)); return { status: 200, body: session(2) }; }
      return r.headers.Authorization === 'Bearer access-2' ? { status: 200, body: { ok: true } } : problem(401, 'AUTH_EXPIRED');
    });
    const tokens = memoryTokenStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens, fetch: s.fetch });
    const res = await Promise.all(Array.from({ length: 5 }, () => http.get<{ ok: boolean }>('/me')));
    expect(res.every((r) => r.ok)).toBe(true);
    expect(refreshes).toBe(1);
    expect(s.calls.find((c) => c.url.endsWith('/auth/refresh'))!.body).toEqual({ refreshToken: 'refresh-1' });
    expect(tokens.getRefreshToken()).toBe('refresh-2');
  });

  it('renouvellement refusé : session terminée, jetons effacés, l’app est prévenue', async () => {
    const s = fakeServer((r) => (r.url.endsWith('/auth/refresh') ? problem(401, 'AUTH_SESSION_EXPIRED') : problem(401, 'AUTH_EXPIRED')));
    const tokens = memoryTokenStore({ accessToken: 'a', refreshToken: 'r' });
    const ended = vi.fn();
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens, fetch: s.fetch, onSessionEnded: ended });
    await expect(http.get('/me')).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
    expect(ended).toHaveBeenCalledWith('expired');
    expect(tokens.getAccessToken()).toBeNull();
  });

  it('deux onglets renouvellent en même temps (409 AUTH_REFRESH_RACE) : on reprend les jetons de l’autre onglet', async () => {
    const tokens = memoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    const s = fakeServer((r) => {
      if (r.url.endsWith('/auth/refresh')) { void tokens.save({ accessToken: 'from-other-tab', refreshToken: 'r2' }); return problem(409, 'AUTH_REFRESH_RACE'); }
      return r.headers.Authorization === 'Bearer from-other-tab' ? { status: 200, body: {} } : problem(401, 'AUTH_EXPIRED');
    });
    await new ApiClient({ baseUrl: 'https://api.test', tokens, fetch: s.fetch }).get('/me');
    expect(s.calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('session révoquée ailleurs ou compte désactivé : l’app est prévenue', async () => {
    const ended = vi.fn();
    const s = fakeServer((r) => (r.url.endsWith('/me') ? problem(401, 'AUTH_SESSION_REVOKED') : problem(403, 'AUTH_ACCOUNT_DISABLED')));
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: s.fetch, onSessionEnded: ended });
    await expect(http.get('/me')).rejects.toBeInstanceOf(ApiProblem);
    await expect(http.get('/gyms')).rejects.toMatchObject({ code: 'AUTH_ACCOUNT_DISABLED' });
    expect(ended.mock.calls).toEqual([['revoked'], ['disabled']]);
  });

  it('action idempotente : clé générée, et la MÊME clé réutilisée après une coupure réseau', async () => {
    let n = 0;
    const s = fakeServer(() => (++n === 1 ? 'network' : { status: 201, body: { id: 't1' } }));
    const api = createMilieuApi(new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: s.fetch }));
    await api.sessions.book('s1');
    expect(s.calls).toHaveLength(2);
    const [k1, k2] = s.calls.map((c) => c.headers['Idempotency-Key']);
    expect(k1).toMatch(/.{16,}/);
    expect(k2).toBe(k1);
  });

  it('action non idempotente : pas renvoyée après une coupure (jamais en double) → NETWORK_ERROR', async () => {
    const s = fakeServer(() => 'network');
    const api = createMilieuApi(new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: s.fetch }));
    const err = await api.tickets.cancel('t1').catch((e: ApiProblem) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR', offline: true });
    expect(s.calls).toHaveLength(1);
  });

  it('délai dépassé → TIMEOUT', async () => {
    const fetchImpl = ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore(), fetch: fetchImpl, timeoutMs: 30 });
    await expect(http.post('/x', {})).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('erreur métier : code, message, erreurs par champ et données en plus', async () => {
    const s = fakeServer(() => problem(409, 'WALLET_INSUFFICIENT', 'Solde insuffisant : il vous manque 2 jeton(s).', { missing: 2, fieldErrors: { tokens: ['Trop'] } }));
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: s.fetch });
    const err = await http.get('/x').catch((e: ApiProblem) => e);
    expect(err).toMatchObject({ status: 409, code: 'WALLET_INSUFFICIENT', extra: { missing: 2 }, fieldErrors: { tokens: ['Trop'] } });
    expect(problemMessage(err, 'fr')).toBe('Solde insuffisant : il vous manque 2 jeton(s).');
    expect(problemMessage(err, 'en')).toBe('Not enough tokens. Top up at the front desk.');
    expect(problemMessage(err, 'ar')).toContain('رصيد');
  });

  it('proxy en panne (502 sans JSON) → message sûr, jamais technique', async () => {
    const http = new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore(), fetch: (async () => new Response('<html>Bad gateway</html>', { status: 502 })) as unknown as typeof fetch });
    const err = await http.get('/x').catch((e: ApiProblem) => e);
    expect(err).toMatchObject({ status: 502, code: 'SERVICE_UNAVAILABLE' });
    expect(problemMessage(err, 'en')).toBe('Service temporarily unavailable. Try again in a moment.');
    expect(problemMessage(new Error('boom'), 'fr')).toBe('Une erreur est survenue. Réessayez.');
  });

  it('réponse hors contrat : signalée, mais l’app continue avec les données', async () => {
    const mismatch = vi.fn();
    const s = fakeServer(() => ({ status: 200, body: { available: 'beaucoup' } }));
    const api = createMilieuApi(new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'a' }), fetch: s.fetch, onContractMismatch: mismatch }));
    expect(await api.me.wallet()).toEqual({ available: 'beaucoup' });
    expect(mismatch).toHaveBeenCalledWith('/me/wallet', expect.arrayContaining([expect.stringContaining('available')]));
  });

  it('mode cookie (web) : pas de jeton de session dans le corps, en-tête X-Refresh-Mode', async () => {
    const s = fakeServer((r) => (r.url.endsWith('/auth/refresh') ? { status: 200, body: { ...session(3), refreshToken: undefined } } : r.headers.Authorization === 'Bearer access-3' ? { status: 200, body: {} } : problem(401, 'AUTH_EXPIRED')));
    await new ApiClient({ baseUrl: 'https://api.test', tokens: memoryTokenStore({ accessToken: 'x' }), refreshMode: 'cookie', fetch: s.fetch }).get('/me');
    const refresh = s.calls.find((c) => c.url.endsWith('/auth/refresh'))!;
    expect(refresh.body).toEqual({});
    expect(refresh.headers['X-Refresh-Mode']).toBe('cookie');
  });
});

describe('cache et temps réel', () => {
  it('chaque événement recharge les bonnes données', () => {
    expect(invalidationsFor('wallet.updated', { gymId: 'g', available: 1, held: 0 })).toEqual([queryKeys.myWallet, queryKeys.myLedger]);
    expect(invalidationsFor('checkin.done', { ticketId: 't', sessionId: 's', gymId: 'g' })).toEqual([queryKeys.roster('s'), queryKeys.ticket('t')]);
    expect(invalidationsFor('session.revoked', { reason: 'expired' })).toEqual([]);
  });
});
