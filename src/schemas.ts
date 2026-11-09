import { z } from 'zod';

/* Contrat partagé MILIEU — ce que l'API renverra plus tard et ce que l'app affiche dès maintenant. */

export const LangSchema = z.enum(['fr', 'en', 'ar']);
export type Lang = z.infer<typeof LangSchema>;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['lagree', 'multi']),
  capacity: z.number().int().positive(),
});
export type Room = z.infer<typeof RoomSchema>;

export const DisciplineSchema = z.object({
  id: z.string(),
  name: z.string(),
  roomKind: z.enum(['lagree', 'multi']),
  tokenCost: z.number().int().positive(),
  durationMin: z.number().int().positive(),
  intensity: z.number().int().min(1).max(3),
  description: z.string(),
});
export type Discipline = z.infer<typeof DisciplineSchema>;

export const CoachSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  bio: z.string(),
  disciplineIds: z.array(z.string()).min(1),
});
export type Coach = z.infer<typeof CoachSchema>;

export const ClassSessionSchema = z.object({
  id: z.string(),
  disciplineId: z.string(),
  coachId: z.string(),
  roomId: z.string(),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().positive(),
  capacity: z.number().int().positive(),
  booked: z.number().int().nonnegative(),
  tokenCost: z.number().int().nonnegative(),
  status: z.enum(['scheduled', 'cancelled']),
}).refine((s) => s.booked <= s.capacity, { message: 'booked > capacity' });
export type ClassSession = z.infer<typeof ClassSessionSchema>;

export const TokenPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokens: z.number().int().positive(),
  priceTnd: z.number().positive(),
  badge: z.enum(['popular', 'best_value']).optional(),
});
export type TokenPack = z.infer<typeof TokenPackSchema>;

export const BonusLotSchema = z.object({ amount: z.number().int().positive(), expiresAt: z.string().date() });
export const WalletSchema = z.object({
  purchased: z.number().int().nonnegative(),
  bonus: z.array(BonusLotSchema),
  reward: z.number().int().nonnegative(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const LEDGER_TYPES = ['purchase', 'bonus', 'reward', 'hold', 'release', 'consume', 'expire', 'adjustment'] as const;
export const LedgerEntrySchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  type: z.enum(LEDGER_TYPES),
  amount: z.number().int(),
  label: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const BOOKING_STATUSES = ['booked', 'waitlist', 'cancelled', 'late_cancel', 'attended', 'no_show'] as const;
export const BookingSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: z.enum(BOOKING_STATUSES),
  waitlistPosition: z.number().int().positive().optional(),
  qr: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Booking = z.infer<typeof BookingSchema>;
export type BookingStatus = Booking['status'];

export const MemberSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  memberSince: z.string().date(),
  lang: LangSchema,
});
export type Member = z.infer<typeof MemberSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  kind: z.enum(['reminder', 'waitlist_promoted', 'class_cancelled', 'tokens_credited', 'info']),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
});
export type AppNotification = z.infer<typeof NotificationSchema>;

export const StudioSchema = z.object({
  name: z.string(),
  address: z.string(),
  cancelHours: z.number().int().positive(),
  rooms: z.array(RoomSchema),
  disciplines: z.array(DisciplineSchema),
  coaches: z.array(CoachSchema),
  packs: z.array(TokenPackSchema),
});
export type Studio = z.infer<typeof StudioSchema>;

/** Solde total utilisable : achetés + bonus non expirés + récompenses. */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const walletTotal = (w: Wallet, today = localToday()) =>
  w.purchased + w.reward + w.bonus.filter((b) => b.expiresAt >= today).reduce((s, b) => s + b.amount, 0);
