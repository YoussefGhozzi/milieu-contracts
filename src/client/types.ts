import { z } from 'zod';

/*
 * Réponses de l'API MILIEU (/api/v1), telles que l'app les reçoit.
 * Schémas Zod « ouverts » : un champ ajouté plus tard par l'API ne casse pas une ancienne app,
 * mais un champ attendu qui manque est détecté (tests de contrat dans milieu-api).
 */

const iso = z.string();
const id = z.string();
const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable();

export const ApiRoleSchema = z.enum(['admin', 'backoffice', 'coach', 'client']);

export const ApiAccountSchema = z.object({
  id, role: ApiRoleSchema, gymId: nullable(id), firstName: z.string(), lastName: z.string(), email: z.string(), phone: z.string(),
  active: z.boolean(), mustChangePassword: z.boolean(), lastLoginAt: nullable(iso), createdAt: iso, createdBy: nullable(id),
  coach: z.object({ bio: z.string(), specialties: z.array(z.string()), photoUrl: nullable(z.string()) }).optional(),
}).passthrough();
export type ApiAccount = z.infer<typeof ApiAccountSchema>;

export const ApiMeSchema = ApiAccountSchema.extend({
  gym: nullable(z.object({ id, name: z.string(), city: z.string(), cancelHours: z.number(), timezone: z.string() }).passthrough()),
});
export type ApiMe = z.infer<typeof ApiMeSchema>;

export const ApiSessionSchema = z.object({
  tokenType: z.literal('Bearer'), accessToken: z.string(), expiresIn: z.number(),
  /** Absent en mode « cookie » (web) : le jeton de session est alors dans un cookie httpOnly. */
  refreshToken: z.string().optional(), refreshExpiresAt: iso, account: ApiAccountSchema,
}).passthrough();
export type ApiAuthSession = z.infer<typeof ApiSessionSchema>;

export const ApiRoomSchema = z.object({ id, name: z.string(), active: z.boolean() }).passthrough();
export const ApiGymSchema = z.object({
  id, name: z.string(), city: z.string(), address: z.string(), timezone: z.string(), cancelHours: z.number(),
  tokenPriceMillimes: z.number(), active: z.boolean(), createdAt: iso, rooms: z.array(ApiRoomSchema),
}).passthrough();
export type ApiGym = z.infer<typeof ApiGymSchema>;

const coachRef = z.object({ id, firstName: z.string(), lastName: z.string(), photoUrl: nullable(z.string()).optional() }).passthrough();
const roomRef = z.object({ id, name: z.string() }).passthrough();

export const ApiCourseSchema = z.object({
  id, gymId: id, title: z.string(), category: z.string(), description: z.string(), status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
  recurrence: z.enum(['once', 'weekly', 'monthly', 'yearly']), startsAt: iso, until: nullable(z.string()), durationMin: z.number(), capacity: z.number(), tokenCost: z.number(),
  room: nullable(roomRef), coach: nullable(coachRef), rejectReason: nullable(z.string()), reviewedBy: nullable(id), reviewedAt: nullable(iso), createdAt: iso,
  sessions: z.object({ total: z.number(), upcoming: z.number(), nextAt: nullable(iso) }),
  plannedSessions: z.number().optional(),
}).passthrough();
export type ApiCourse = z.infer<typeof ApiCourseSchema>;

export const ApiSessionViewSchema = z.object({
  id, courseId: id, gymId: id, title: z.string(), category: z.string(), description: z.string(), recurrence: z.string(),
  startsAt: iso, endsAt: iso, durationMin: z.number(), capacity: z.number(), seatsTaken: z.number(), seatsLeft: z.number(), full: z.boolean(),
  tokenCost: z.number(), status: z.enum(['scheduled', 'cancelled']), started: z.boolean(), ended: z.boolean(), room: roomRef, coach: coachRef,
}).passthrough();
export type ApiClassSession = z.infer<typeof ApiSessionViewSchema>;

export const ApiTicketStatusSchema = z.enum(['booked', 'waitlist', 'cancelled', 'late_cancel', 'attended', 'no_show']);
export const ApiTicketSchema = z.object({
  id, code: z.string(), status: ApiTicketStatusSchema, waitlistPosition: nullable(z.number()), tokenCost: z.number(), qr: nullable(z.string()),
  createdAt: iso, closedAt: nullable(iso), clientId: id,
  cancellation: z.object({ possible: z.boolean(), late: z.boolean(), freeUntil: nullable(iso) }),
  rating: nullable(z.object({ stars: z.number(), comment: nullable(z.string()), createdAt: iso })).optional(),
  rateable: z.boolean().optional(), rateUntil: nullable(iso).optional(),
  session: z.object({
    id, courseId: id, title: z.string(), category: z.string(), startsAt: iso, endsAt: iso, durationMin: z.number(), status: z.string(), room: roomRef, coach: coachRef,
  }).passthrough(),
}).passthrough();
export type ApiTicket = z.infer<typeof ApiTicketSchema>;

export const ApiRosterSchema = z.object({
  session: ApiSessionViewSchema,
  counts: z.object({ booked: z.number(), attended: z.number(), noShow: z.number(), waitlist: z.number() }),
  attendees: z.array(z.object({
    ticketId: id, status: ApiTicketStatusSchema, waitlistPosition: nullable(z.number()), bookedAt: iso, closedAt: nullable(iso),
    client: z.object({ id, firstName: z.string(), lastName: z.string(), phone: z.string().optional() }).passthrough(),
  }).passthrough()),
}).passthrough();
export type ApiRoster = z.infer<typeof ApiRosterSchema>;

export const ApiWalletSchema = z.object({
  clientId: id, gymId: id, available: z.number(), held: z.number(), spent: z.number(), recharged: z.number(), offered: z.number(),
}).passthrough();
export type ApiWallet = z.infer<typeof ApiWalletSchema>;

export const ApiLedgerEntrySchema = z.object({
  id, type: z.enum(['recharge', 'hold', 'release', 'consume', 'adjustment', 'bonus', 'expire']), amount: z.number(), settled: z.number(),
  reason: nullable(z.enum(['attended', 'no_show', 'late_cancel'])), label: z.string(), ticketId: nullable(id), rechargeId: nullable(id), at: iso,
}).passthrough();
export type ApiLedgerEntry = z.infer<typeof ApiLedgerEntrySchema>;
export const ApiLedgerPageSchema = z.object({ items: z.array(ApiLedgerEntrySchema), next: nullable(z.string()) }).passthrough();

const promoRef = z.object({ id, title: z.string(), value: z.number() }).passthrough();
export const ApiQuoteSchema = z.object({
  tokens: z.number(), unitPriceMillimes: z.number(), baseMillimes: z.number(), discountMillimes: z.number(), totalMillimes: z.number(), bonus: z.number(),
  percentPromo: nullable(promoRef), bonusPromo: nullable(promoRef),
}).passthrough();
export type ApiQuote = z.infer<typeof ApiQuoteSchema>;

export const ApiReceiptSchema = z.object({
  id, receipt: z.string(), receiptNumber: z.number(), gymId: id, client: z.object({ id, firstName: z.string(), lastName: z.string() }).passthrough(),
  cashierId: id, tokens: z.number(), bonusTokens: z.number(), unitPriceMillimes: z.number(), discountMillimes: z.number(), totalMillimes: z.number(),
  method: z.enum(['cash', 'card_terminal', 'transfer', 'other']), methodLabel: z.string(), promoIds: z.array(id), note: nullable(z.string()), at: iso,
}).passthrough();
export type ApiReceipt = z.infer<typeof ApiReceiptSchema>;

export const ApiPromotionSchema = z.object({
  id, gymId: id, title: z.string(), description: z.string(), kind: z.enum(['percent_off', 'bonus_tokens']), value: z.number(), minTokens: z.number(),
  startsOn: z.string(), endsOn: z.string(), active: z.boolean(), state: z.string(), label: z.string(), createdAt: iso,
}).passthrough();
export type ApiPromotion = z.infer<typeof ApiPromotionSchema>;

export const ApiNotificationSchema = z.object({
  id, kind: z.string(), title: z.string(), body: z.string(), link: nullable(z.string()), read: z.boolean(), createdAt: iso,
}).passthrough();
export type ApiNotification = z.infer<typeof ApiNotificationSchema>;
export const ApiNotificationPageSchema = z.object({ unread: z.number(), items: z.array(ApiNotificationSchema), next: nullable(z.string()) }).passthrough();

export const ApiRatingSummarySchema = z.object({ avg: z.number(), count: z.number(), distribution: z.array(z.number()) });
export const ApiCoachSchema = z.object({
  id, gymId: nullable(id), firstName: z.string(), lastName: z.string(), bio: z.string(), specialties: z.array(z.string()), photoUrl: nullable(z.string()),
  rating: ApiRatingSummarySchema,
}).passthrough();
export type ApiCoach = z.infer<typeof ApiCoachSchema>;
export const ApiReviewSchema = z.object({
  id, stars: z.number(), comment: nullable(z.string()), createdAt: iso, client: z.object({ firstName: z.string() }),
  session: z.object({ title: z.string(), startsAt: iso }), hidden: z.boolean().optional(),
}).passthrough();
export type ApiReview = z.infer<typeof ApiReviewSchema>;
export const ApiCoachProfileSchema = ApiCoachSchema.extend({ active: z.boolean(), reviews: z.array(ApiReviewSchema) });
export type ApiCoachProfile = z.infer<typeof ApiCoachProfileSchema>;

export const ApiCheckInSchema = z.object({
  ticket: ApiTicketSchema, client: z.object({ id, firstName: z.string(), lastName: z.string() }).passthrough(), checkedInAt: iso, checkedInBy: id,
}).passthrough();
export type ApiCheckIn = z.infer<typeof ApiCheckInSchema>;

export const ApiPendingRatingSchema = z.object({
  ticketId: id, sessionId: id, title: z.string(), category: z.string(), startsAt: iso, endsAt: iso, rateUntil: iso, coach: coachRef,
}).passthrough();
export type ApiPendingRating = z.infer<typeof ApiPendingRatingSchema>;

/** Liste paginée par numéro de page. */
export interface ApiPage<T> { items: T[]; total?: number; page?: number; limit?: number }
