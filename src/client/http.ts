import type { ZodType } from 'zod';
import { ApiProblem } from './errors';

/*
 * Client HTTP de l'API MILIEU, sans dépendance (fetch) : utilisable par l'app Expo (web et mobile), l'app staff et les tests.
 * - jeton d'accès envoyé automatiquement, renouvelé une seule fois en cas d'expiration (même si 10 requêtes échouent ensemble) ;
 * - clé d'idempotence générée pour les actions sensibles (réserver, encaisser, scanner) et réutilisée si l'on réessaie ;
 * - délai maximal, erreurs réseau et erreurs de l'API transformées en `ApiProblem` (code stable + message).
 */

export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  /** `null` en mode cookie (web) : le navigateur envoie lui-même le cookie httpOnly. */
  getRefreshToken(): string | null | Promise<string | null>;
  save(tokens: { accessToken: string; refreshToken?: string }): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** Jetons gardés en mémoire seulement (tests, ou web en mode cookie pour le jeton d'accès). */
export function memoryTokenStore(initial: { accessToken?: string; refreshToken?: string } = {}): TokenStore {
  let access = initial.accessToken ?? null;
  let refresh = initial.refreshToken ?? null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    save: (t) => { access = t.accessToken; if (t.refreshToken !== undefined) refresh = t.refreshToken; },
    clear: () => { access = null; refresh = null; },
  };
}

export type SessionEndReason = 'expired' | 'revoked' | 'disabled';

export interface ApiClientOptions {
  /** Adresse de l'API, sans /api/v1 (ex. https://api.milieu.tn). */
  baseUrl: string;
  tokens: TokenStore;
  /** `cookie` : le jeton de session est dans un cookie httpOnly (web) ; `body` : il est gardé par l'app (mobile). */
  refreshMode?: 'body' | 'cookie';
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Session terminée (expirée, fermée ailleurs, compte désactivé) : l'app renvoie vers l'écran de connexion. */
  onSessionEnded?: (reason: SessionEndReason) => void;
  /** Réponse qui ne correspond pas au contrat : signalée (journal, Sentry), mais l'app continue avec les données reçues. */
  onContractMismatch?: (path: string, issues: string[]) => void;
  /** Langue préférée, transmise à l'API (`Accept-Language`). */
  lang?: () => string;
}

export interface CallOptions<T> {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** `true` : nouvelle clé générée ; une chaîne : clé fournie (rejouer exactement la même action). */
  idempotent?: boolean | string;
  schema?: ZodType<T>;
  /** Route publique (connexion, renouvellement). */
  anonymous?: boolean;
  signal?: AbortSignal;
  /** Corps déjà préparé (envoi de photo). */
  form?: FormData;
}

const SESSION_CODES_REVOKED = new Set(['AUTH_SESSION_REVOKED', 'AUTH_INVALID_TOKEN', 'AUTH_REFRESH_REUSED']);
const SESSION_CODES_DISABLED = new Set(['AUTH_ACCOUNT_DISABLED', 'AUTH_GYM_DISABLED']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function newIdempotencyKey() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export class ApiClient {
  readonly baseUrl: string;
  private refreshing: Promise<boolean> | null = null;
  /** Appel réseau (signature minimale : compatible avec le fetch de Node, des navigateurs et de React Native). */
  private readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>;

  constructor(readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    const custom = options.fetch;
    this.fetchImpl = custom ? (url, init) => custom(url, init) : (url, init) => fetch(url, init);
  }

  url(path: string, query?: CallOptions<unknown>['query']) {
    const qs = Object.entries(query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return `${this.baseUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;
  }

  get<T>(path: string, opts: CallOptions<T> = {}) { return this.call<T>('GET', path, opts); }
  post<T>(path: string, body?: unknown, opts: CallOptions<T> = {}) { return this.call<T>('POST', path, { ...opts, body }); }
  patch<T>(path: string, body?: unknown, opts: CallOptions<T> = {}) { return this.call<T>('PATCH', path, { ...opts, body }); }
  put<T>(path: string, body?: unknown, opts: CallOptions<T> = {}) { return this.call<T>('PUT', path, { ...opts, body }); }
  delete<T>(path: string, opts: CallOptions<T> = {}) { return this.call<T>('DELETE', path, opts); }

  async call<T>(method: string, path: string, opts: CallOptions<T> = {}): Promise<T> {
    const key = opts.idempotent === true ? newIdempotencyKey() : typeof opts.idempotent === 'string' ? opts.idempotent : undefined;
    // Un GET ou une action idempotente peut être renvoyé sans risque après une coupure réseau.
    const retriable = method === 'GET' || !!key;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.send(method, path, opts, key);
      } catch (e) {
        if (e instanceof ApiProblem && e.offline && retriable && attempt === 0 && !opts.signal?.aborted) { await sleep(800); continue; }
        throw e;
      }
      if (res.ok) return this.parse<T>(res, path, opts.schema);
      const problem = await toProblem(res);
      if (res.status === 401 && !opts.anonymous) {
        if (problem.code === 'AUTH_EXPIRED' && !refreshed) {
          refreshed = true;
          if (await this.refresh()) continue;
          throw problem;
        }
        if (SESSION_CODES_REVOKED.has(problem.code)) await this.end('revoked');
      }
      if (SESSION_CODES_DISABLED.has(problem.code) && !opts.anonymous) await this.end('disabled');
      throw problem;
    }
  }

  /**
   * Renouvelle le jeton d'accès. Une seule tentative à la fois : toutes les requêtes qui attendent profitent du même résultat.
   * `false` : la session est terminée (l'app doit se reconnecter).
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(raceRetry = true): Promise<boolean> {
    const { tokens } = this.options;
    const cookie = this.options.refreshMode === 'cookie';
    const refreshToken = cookie ? null : await tokens.getRefreshToken();
    if (!cookie && !refreshToken) { await this.end('expired'); return false; }
    const before = await tokens.getAccessToken();
    const res = await this.send('POST', '/auth/refresh', { body: cookie ? {} : { refreshToken }, anonymous: true });
    if (res.ok) {
      const session = await res.json() as { accessToken: string; refreshToken?: string };
      await tokens.save({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      return true;
    }
    const problem = await toProblem(res);
    if (problem.code === 'AUTH_REFRESH_RACE') {
      // Un autre onglet ou appareil vient de renouveler : on reprend ses jetons s'ils sont déjà enregistrés.
      await sleep(400);
      if ((await tokens.getAccessToken()) !== before) return true;
      if (raceRetry) return this.doRefresh(false);
    }
    if (res.status >= 500 || res.status === 429) throw problem;
    await this.end(SESSION_CODES_DISABLED.has(problem.code) ? 'disabled' : problem.code === 'AUTH_REFRESH_REUSED' ? 'revoked' : 'expired');
    return false;
  }

  private async end(reason: SessionEndReason) {
    await this.options.tokens.clear();
    this.options.onSessionEnded?.(reason);
  }

  private async send(method: string, path: string, opts: CallOptions<unknown>, key?: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';
    if (key) headers['Idempotency-Key'] = key;
    if (this.options.refreshMode === 'cookie') headers['X-Refresh-Mode'] = 'cookie';
    const lang = this.options.lang?.();
    if (lang) headers['Accept-Language'] = lang;
    if (!opts.anonymous) {
      const access = await this.options.tokens.getAccessToken();
      if (access) headers.Authorization = `Bearer ${access}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      return await this.fetchImpl(this.url(path, opts.query), {
        method, headers, credentials: 'include', signal: controller.signal,
        body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      });
    } catch {
      if (opts.signal?.aborted) throw new ApiProblem(0, 'ABORTED', 'Requête annulée.');
      if (controller.signal.aborted) throw new ApiProblem(0, 'TIMEOUT', 'Le serveur met trop de temps à répondre. Réessayez dans un instant.');
      throw new ApiProblem(0, 'NETWORK_ERROR', 'Pas de connexion. Vérifiez internet et réessayez.');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async parse<T>(res: Response, path: string, schema?: ZodType<T>): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!schema) return data as T;
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;
    this.options.onContractMismatch?.(path, parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`));
    return data as T;
  }
}

const KNOWN = new Set(['type', 'title', 'status', 'detail', 'code', 'fieldErrors', 'instance']);

async function toProblem(res: Response): Promise<ApiProblem> {
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* corps vide ou non JSON (proxy) */ }
  const code = typeof body.code === 'string' ? body.code : res.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'ERROR';
  const detail = typeof body.detail === 'string' ? body.detail : res.status >= 500 ? 'Service momentanément indisponible. Réessayez dans un instant.' : 'Une erreur est survenue.';
  const extra = Object.fromEntries(Object.entries(body).filter(([k]) => !KNOWN.has(k)));
  return new ApiProblem(res.status, code, detail, (body.fieldErrors as Record<string, string[]>) ?? {}, extra);
}
