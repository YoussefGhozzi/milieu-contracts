import { z } from 'zod';
import type { ApiClient } from './http';
import {
  ApiAccountSchema, ApiCheckInSchema, ApiCoachProfileSchema, ApiCoachSchema, ApiCourseSchema, ApiGymSchema, ApiLedgerPageSchema, ApiMeSchema,
  ApiNotificationPageSchema, ApiPendingRatingSchema, ApiPromotionSchema, ApiQuoteSchema, ApiReceiptSchema, ApiReviewSchema, ApiRosterSchema,
  ApiSessionSchema, ApiSessionViewSchema, ApiTicketSchema, ApiWalletSchema,
  type ApiAccount, type ApiAuthSession, type ApiTicket,
} from './types';

/*
 * Toutes les routes de l'API, typées. Une fonction = une route ; les actions sensibles sont idempotentes
 * (passer `key` pour rejouer exactement la même action après une erreur réseau).
 */

const items = <T extends z.ZodTypeAny>(t: T) => z.object({ items: z.array(t) }).passthrough();
const paged = <T extends z.ZodTypeAny>(t: T) => z.object({ items: z.array(t), total: z.number().optional(), page: z.number().optional(), limit: z.number().optional() }).passthrough();
const enc = encodeURIComponent;

export type ApiPaymentMethod = 'cash' | 'card_terminal' | 'transfer' | 'other';
export interface ApiCourseInput {
  title: string; category: string; description?: string; roomId: string; startsAt: string; durationMin: number; capacity: number; tokenCost: number;
  recurrence: 'once' | 'weekly' | 'monthly' | 'yearly'; until?: string | null;
}

export function createMilieuApi(http: ApiClient) {
  return {
    http,
    auth: {
      login: (email: string, password: string) => http.post<ApiAuthSession>('/auth/login', { email, password }, { anonymous: true, schema: ApiSessionSchema }),
      /** Ferme la session de cet appareil (le jeton de session est révoqué). */
      logout: (refreshToken?: string) => http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}, { anonymous: true }),
      logoutAll: () => http.post<void>('/auth/logout-all', {}),
      changePassword: (currentPassword: string, newPassword: string) =>
        http.post<ApiAuthSession>('/auth/password/change', { currentPassword, newPassword }, { schema: ApiSessionSchema }),
    },
    me: {
      get: () => http.get('/me', { schema: ApiMeSchema }),
      update: (patch: { firstName?: string; lastName?: string; phone?: string; bio?: string; specialties?: string[] }) => http.patch('/me', patch, { schema: ApiMeSchema }),
      uploadPhoto: (form: FormData) => http.call('POST', '/me/photo', { form, body: null, schema: ApiMeSchema }),
      deletePhoto: () => http.delete('/me/photo', { schema: ApiMeSchema }),
      notifications: (q: { unread?: boolean; limit?: number; before?: string } = {}) => http.get('/me/notifications', { query: q, schema: ApiNotificationPageSchema }),
      readNotification: (id: string) => http.post<{ id: string; read: boolean }>(`/me/notifications/${enc(id)}/read`),
      readAllNotifications: () => http.post<{ marked: number; unread: number }>('/me/notifications/read-all'),
      tickets: (q: { scope?: 'upcoming' | 'past' | 'all'; page?: number; limit?: number } = {}) => http.get('/me/tickets', { query: q, schema: items(ApiTicketSchema) }),
      wallet: () => http.get('/me/wallet', { schema: ApiWalletSchema }),
      ledger: (q: { limit?: number; before?: string } = {}) => http.get('/me/wallet/ledger', { query: q, schema: ApiLedgerPageSchema }),
      pendingRatings: () => http.get('/me/ratings/pending', { schema: items(ApiPendingRatingSchema) }),
    },
    gyms: {
      list: () => http.get('/gyms', { schema: z.array(ApiGymSchema) }),
      get: (id: string) => http.get(`/gyms/${enc(id)}`, { schema: ApiGymSchema }),
      create: (input: { name: string; city: string; address?: string; tokenPriceMillimes: number; cancelHours?: number; rooms: string[] }) => http.post('/gyms', input, { schema: ApiGymSchema }),
      update: (id: string, patch: { name?: string; city?: string; address?: string; cancelHours?: number; active?: boolean }) => http.patch(`/gyms/${enc(id)}`, patch, { schema: ApiGymSchema }),
      setTokenPrice: (id: string, priceMillimes: number) => http.put<unknown>(`/gyms/${enc(id)}/token-price`, { priceMillimes }),
      addRoom: (id: string, name: string) => http.post<unknown>(`/gyms/${enc(id)}/rooms`, { name }),
      updateRoom: (id: string, roomId: string, patch: { name?: string; active?: boolean }) => http.patch<unknown>(`/gyms/${enc(id)}/rooms/${enc(roomId)}`, patch),
    },
    accounts: {
      list: (q: { q?: string; role?: string; gymId?: string; active?: boolean; page?: number; limit?: number } = {}) => http.get('/accounts', { query: q, schema: paged(ApiAccountSchema) }),
      get: (id: string) => http.get(`/accounts/${enc(id)}`, { schema: ApiAccountSchema }),
      create: (input: { role: 'backoffice' | 'coach' | 'client'; gymId?: string; firstName: string; lastName?: string; email: string; phone?: string; bio?: string; specialties?: string[] }) =>
        http.post<{ account: ApiAccount; temporaryPassword: string }>('/accounts', input),
      update: (id: string, patch: { firstName?: string; lastName?: string; email?: string; phone?: string; active?: boolean; bio?: string; specialties?: string[] }) => http.patch(`/accounts/${enc(id)}`, patch, { schema: ApiAccountSchema }),
      resetPassword: (id: string) => http.post<{ temporaryPassword: string }>(`/accounts/${enc(id)}/reset-password`),
    },
    courses: {
      list: (q: { status?: string; coachId?: string; gymId?: string; page?: number; limit?: number } = {}) => http.get('/courses', { query: q, schema: paged(ApiCourseSchema) }),
      get: (id: string) => http.get(`/courses/${enc(id)}`, { schema: ApiCourseSchema }),
      create: (input: ApiCourseInput) => http.post('/courses', input, { schema: ApiCourseSchema }),
      preview: (id: string) => http.get<{ sessions: number; conflicts: unknown[] }>(`/courses/${enc(id)}/preview`),
      approve: (id: string) => http.post(`/courses/${enc(id)}/approve`, undefined, { schema: ApiCourseSchema }),
      reject: (id: string, reason: string) => http.post(`/courses/${enc(id)}/reject`, { reason }, { schema: ApiCourseSchema }),
      cancel: (id: string, reason?: string) => http.post<unknown>(`/courses/${enc(id)}/cancel`, reason ? { reason } : {}),
    },
    sessions: {
      list: (q: { from?: string; to?: string; coachId?: string; roomId?: string; courseId?: string; gymId?: string; includeCancelled?: boolean } = {}) =>
        http.get('/sessions', { query: q, schema: z.object({ from: z.string(), to: z.string(), items: z.array(ApiSessionViewSchema) }).passthrough() }),
      get: (id: string) => http.get(`/sessions/${enc(id)}`, { schema: ApiSessionViewSchema }),
      roster: (id: string) => http.get(`/sessions/${enc(id)}/roster`, { schema: ApiRosterSchema }),
      book: (id: string, opts: { waitlist?: boolean; key?: string } = {}) =>
        http.post<ApiTicket>(`/sessions/${enc(id)}/bookings`, opts.waitlist ? { waitlist: true } : {}, { idempotent: opts.key ?? true, schema: ApiTicketSchema }),
    },
    tickets: {
      /** Staff : tickets de la salle (par séance, client ou période). Chaque ticket porte aussi client (prénom, nom). */
      list: (q: { sessionId?: string; clientId?: string; from?: string; to?: string; status?: string; gymId?: string; page?: number; limit?: number } = {}) =>
        http.get('/tickets', { query: q, schema: paged(ApiTicketSchema) }),
      get: (id: string) => http.get(`/tickets/${enc(id)}`, { schema: ApiTicketSchema }),
      cancel: (id: string, opts: { waiveFee?: boolean } = {}) =>
        http.post<{ ticket: ApiTicket; late: boolean; refunded: number; promoted: number }>(`/tickets/${enc(id)}/cancel`, opts.waiveFee ? { waiveFee: true } : {}),
      rate: (id: string, stars: number, comment?: string) =>
        http.post<{ id: string; ticketId: string; coachId: string; stars: number; comment: string | null; createdAt: string }>(`/tickets/${enc(id)}/rating`, { stars, ...(comment ? { comment } : {}) }),
      /** Scan : QR, code court ou ticket coché dans la liste des inscrits. */
      checkIn: (input: { code?: string; ticketId?: string; sessionId?: string }, key?: string) =>
        http.post('/checkin', input, { idempotent: key ?? true, schema: ApiCheckInSchema }),
    },
    wallet: {
      /** Accueil, admin : soldes de tous les clients de la salle. */
      list: (q: { gymId?: string; q?: string } = {}) => http.get('/wallets', { query: q, schema: items(ApiWalletSchema) }),
      ofClient: (clientId: string) => http.get(`/clients/${enc(clientId)}/wallet`, { schema: ApiWalletSchema }),
      ledgerOfClient: (clientId: string, q: { limit?: number; before?: string } = {}) => http.get(`/clients/${enc(clientId)}/wallet/ledger`, { query: q, schema: ApiLedgerPageSchema }),
      quote: (clientId: string, tokens: number) => http.post('/recharges/quote', { clientId, tokens }, { schema: ApiQuoteSchema }),
      recharge: (input: { clientId: string; tokens: number; method: ApiPaymentMethod; expectedTotalMillimes: number; note?: string }, key?: string) =>
        http.post('/recharges', input, { idempotent: key ?? true, schema: z.object({ receipt: ApiReceiptSchema }).passthrough() }),
      recharges: (q: { date?: string; gymId?: string } = {}) => http.get<{ gymId: string; date: string; count: number; totalMillimes: number; tokens: number; bonusTokens: number; byMethod: Record<string, { count: number; totalMillimes: number }>; items: z.infer<typeof ApiReceiptSchema>[] }>('/recharges', { query: q }),
      receipt: (id: string) => http.get(`/recharges/${enc(id)}`, { schema: ApiReceiptSchema }),
      adjust: (input: { clientId: string; amount: number; reason: string }, key?: string) => http.post<unknown>('/wallet/adjustments', input, { idempotent: key ?? true }),
    },
    promotions: {
      list: (q: { gymId?: string; state?: 'active' | 'scheduled' | 'expired' | 'disabled' } = {}) => http.get('/promotions', { query: q, schema: items(ApiPromotionSchema) }),
      create: (input: { gymId: string; title: string; description?: string; kind: 'percent_off' | 'bonus_tokens'; value: number; minTokens?: number; startsOn: string; endsOn: string }) =>
        http.post('/promotions', input, { schema: ApiPromotionSchema }),
      update: (id: string, patch: { title?: string; description?: string; active?: boolean; startsOn?: string; endsOn?: string }) =>
        http.patch(`/promotions/${enc(id)}`, patch, { schema: ApiPromotionSchema }),
      remove: (id: string) => http.delete<void>(`/promotions/${enc(id)}`),
    },
    coaches: {
      list: (q: { gymId?: string } = {}) => http.get('/coaches', { query: q, schema: items(ApiCoachSchema) }),
      get: (id: string) => http.get(`/coaches/${enc(id)}`, { schema: ApiCoachProfileSchema }),
      reviews: (id: string, q: { page?: number; limit?: number } = {}) => http.get(`/coaches/${enc(id)}/ratings`, { query: q, schema: items(ApiReviewSchema) }),
      hideReview: (ratingId: string, reason?: string) => http.post<unknown>(`/ratings/${enc(ratingId)}/hide`, reason ? { reason } : {}),
      unhideReview: (ratingId: string) => http.post<unknown>(`/ratings/${enc(ratingId)}/unhide`),
    },
  };
}
export type MilieuApi = ReturnType<typeof createMilieuApi>;
