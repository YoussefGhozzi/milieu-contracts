import { z } from 'zod';

/*
 * Contrat « réseau MILIEU » : plusieurs salles, rôles (admin, accueil, coach, client),
 * cours proposés par les coachs et validés par l'accueil, tickets QR et jetons rechargés à l'accueil.
 *
 * Ces schémas décrivent ce que le futur backend exposera. En attendant, l'app les stocke
 * dans le navigateur (localStorage) via `apps/app/src/backend`.
 */

export const RoleSchema = z.enum(['admin', 'backoffice', 'coach', 'client']);
export type Role = z.infer<typeof RoleSchema>;

export const GymSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  city: z.string().min(2),
  address: z.string(),
  /** Délai d'annulation gratuite, en heures (24 h par défaut). */
  cancelHours: z.number().int().positive(),
  rooms: z.array(z.string()).min(1),
  /** Prix d'un jeton en dinars tunisiens, fixé par l'administrateur pour chaque salle. */
  tokenPriceTnd: z.number().positive().default(10),
  createdAt: z.string().datetime(),
});
export type Gym = z.infer<typeof GymSchema>;

/**
 * Promotion d'une salle, gérée par l'administrateur, appliquée aux recharges faites à l'accueil :
 * - percent_off : remise en % sur le prix à payer
 * - bonus_tokens : `value` jetons offerts dès `minTokens` jetons achetés
 */
export const PromotionSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  title: z.string().min(2),
  description: z.string(),
  kind: z.enum(['percent_off', 'bonus_tokens']),
  value: z.number().int().positive(),
  minTokens: z.number().int().nonnegative(),
  /** Période de validité incluse, AAAA-MM-JJ. */
  startsOn: z.string(),
  endsOn: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
});
export type Promotion = z.infer<typeof PromotionSchema>;

/** Évaluation d'une séance terminée par un client présent : note du coach + avis facultatif. */
export const RatingSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  coachId: z.string(),
  clientId: z.string(),
  courseId: z.string(),
  ticketId: z.string(),
  occurrenceAt: z.string().datetime(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  at: z.string().datetime(),
});
export type Rating = z.infer<typeof RatingSchema>;

export const AccountSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  /** Salle de rattachement. `null` uniquement pour l'administrateur du réseau. */
  gymId: z.string().nullable(),
  firstName: z.string().min(1),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  /** Démo uniquement : le vrai backend stockera un hash. */
  password: z.string().min(4),
  bio: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  /** Photo de profil (URL ou image encodée « data: »), affichée aux clients pour les coachs. */
  photoUrl: z.string().optional(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

export const RecurrenceSchema = z.enum(['once', 'weekly', 'monthly', 'yearly']);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

export const COURSE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export const CourseSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  coachId: z.string(),
  title: z.string().min(2),
  /** Famille de cours (lagree, hot-sculpt, mat-pilates, mobility, functional) : sert au visuel. */
  category: z.string(),
  description: z.string(),
  room: z.string(),
  /** Première séance (date et heure exactes). */
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(240),
  capacity: z.number().int().min(1).max(200),
  tokenCost: z.number().int().min(1).max(50),
  recurrence: RecurrenceSchema,
  /** Dernier jour de répétition (inclus), AAAA-MM-JJ. Ignoré pour un cours ponctuel. */
  until: z.string().nullable(),
  status: z.enum(COURSE_STATUSES),
  reviewNote: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type Course = z.infer<typeof CourseSchema>;
export type CourseStatus = Course['status'];

export const TICKET_STATUSES = ['booked', 'cancelled', 'late_cancel', 'attended', 'no_show'] as const;
export const TicketSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  courseId: z.string(),
  /** Début de la séance réservée (une occurrence du cours). */
  occurrenceAt: z.string().datetime(),
  clientId: z.string(),
  /** Code encodé dans le QR, présenté à l'entrée. */
  code: z.string(),
  status: z.enum(TICKET_STATUSES),
  tokenCost: z.number().int().positive(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().optional(),
  checkedInBy: z.string().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;
export type TicketStatus = Ticket['status'];

/**
 * Mouvements de jetons :
 * - recharge (+) : crédit fait par l'accueil (espèces, TPE…)
 * - hold (−) : jetons réservés à la réservation
 * - release (+) : jetons rendus (annulation dans les délais, cours annulé)
 * - consume (0) : jetons réservés définitivement débités (présence scannée, absence, annulation tardive)
 * - adjustment (±) : correction manuelle de l'accueil
 * - bonus (+) : jetons offerts par une promotion lors d'une recharge
 */
export const TOKEN_MOVE_TYPES = ['recharge', 'hold', 'release', 'consume', 'adjustment', 'bonus'] as const;
export const TokenMoveSchema = z.object({
  id: z.string(),
  gymId: z.string(),
  clientId: z.string(),
  at: z.string().datetime(),
  type: z.enum(TOKEN_MOVE_TYPES),
  amount: z.number().int(),
  /** Pour `consume` : nombre de jetons débités définitivement (le solde a déjà baissé au `hold`). */
  settled: z.number().int().nonnegative().optional(),
  reason: z.enum(['attended', 'no_show', 'late_cancel']).optional(),
  label: z.string(),
  by: z.string().nullable(),
  method: z.enum(['cash', 'card_terminal', 'transfer', 'other']).optional(),
  ticketId: z.string().optional(),
  /** Recharge : montant encaissé en dinars (après remise). */
  priceTnd: z.number().nonnegative().optional(),
  /** Promotion appliquée à cette recharge. */
  promoId: z.string().optional(),
});
export type TokenMove = z.infer<typeof TokenMoveSchema>;

export const NetworkNotificationSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  at: z.string().datetime(),
  kind: z.enum(['course_submitted', 'course_approved', 'course_rejected', 'new_course', 'recharge', 'check_in', 'no_show', 'late_cancel', 'booking', 'rating', 'promo']),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  link: z.string().optional(),
});
export type NetworkNotification = z.infer<typeof NetworkNotificationSchema>;

export const NetworkDbSchema = z.object({
  version: z.literal(1),
  gyms: z.array(GymSchema),
  accounts: z.array(AccountSchema),
  courses: z.array(CourseSchema),
  tickets: z.array(TicketSchema),
  moves: z.array(TokenMoveSchema),
  notifications: z.array(NetworkNotificationSchema),
  promotions: z.array(PromotionSchema).default([]),
  ratings: z.array(RatingSchema).default([]),
});
export type NetworkDb = z.infer<typeof NetworkDbSchema>;
