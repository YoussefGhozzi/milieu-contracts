/**
 * Client de l'API MILIEU, partagé par l'app client et l'app staff.
 *
 * ```ts
 * const http = new ApiClient({ baseUrl: 'https://api.milieu.tn', tokens: memoryTokenStore(), onSessionEnded: () => router.replace('/login') });
 * const api = createMilieuApi(http);
 * const session = await api.auth.login(email, password);
 * await http.options.tokens.save(session);
 * const ticket = await api.sessions.book(sessionId); // idempotent : un double clic ne réserve qu'une fois
 * ```
 */
export * from './types';
export * from './errors';
export * from './http';
export * from './endpoints';
export * from './cache';
