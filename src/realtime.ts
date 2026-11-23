import { z } from 'zod';

/*
 * Temps réel (Socket.IO, chemin /socket.io de l'API).
 *
 * Les événements ne transportent que des identifiants et des compteurs : l'app recharge le détail par l'API
 * (invalidation des requêtes). Rien de personnel ne circule sur la connexion.
 *
 * Connexion : `io(url, { path: '/socket.io', auth: { token: <jeton d'accès> } })`.
 * Salons rejoints automatiquement : `account:{id}`, `gym:{id}`, `gym:{id}:staff` (coach, accueil), `gym:{id}:desk` (accueil),
 * `network:admin`. Écran d'une séance : `session.join` / `session.leave` (salon `session:{id}`).
 */

const id = z.string().uuid();
/** Schéma strict : un champ en trop (une donnée personnelle par erreur) est refusé, jamais envoyé. */
const ev = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const RealtimeEventSchemas = {
  /** Places d'une séance (réservation, annulation, liste d'attente, séance annulée). Salle + séance. */
  'session.seats': ev({ sessionId: id, gymId: id, capacity: z.number().int(), seatsTaken: z.number().int(), seatsLeft: z.number().int(), status: z.enum(['scheduled', 'cancelled']) }),
  /** Nouvelle demande de cours. Accueil de la salle. */
  'course.submitted': ev({ courseId: id, gymId: id, coachId: id }),
  /** Cours validé ou refusé. Coach + salle. */
  'course.reviewed': ev({ courseId: id, gymId: id, coachId: id, status: z.enum(['approved', 'rejected']) }),
  /** Cours annulé. Coach + salle. */
  'course.cancelled': ev({ courseId: id, gymId: id, coachId: id }),
  /** Ticket créé ou changé de statut. Client + staff de l'écran de la séance. */
  'ticket.updated': ev({ ticketId: id, sessionId: id, status: z.string() }),
  /** Présence validée. Staff de l'écran de la séance + staff de la salle. */
  'checkin.done': ev({ ticketId: id, sessionId: id, gymId: id }),
  /** Solde changé. Client (son solde seulement). */
  'wallet.updated': ev({ gymId: id, available: z.number().int(), held: z.number().int() }),
  /** Nouvelle notification. Destinataire. */
  'notification.created': ev({ notificationId: id, kind: z.string() }),
  /** Promotion créée, modifiée ou supprimée. Salle + admin. */
  'promo.changed': ev({ gymId: id, promoId: id }),
  /** Chiffres du tableau de bord à rafraîchir (au plus une fois toutes les quelques secondes par salle). Accueil + admin. */
  'kpi.changed': ev({ gymId: id }),
  /** Session fermée côté serveur (déconnexion partout, compte désactivé, jeton expiré) : se reconnecter avec un nouveau jeton. */
  'session.revoked': ev({ reason: z.enum(['expired', 'revoked']) }),
} as const;

export type RealtimeEvent = keyof typeof RealtimeEventSchemas;
export type RealtimePayload<E extends RealtimeEvent> = z.infer<(typeof RealtimeEventSchemas)[E]>;
export const REALTIME_EVENTS = Object.keys(RealtimeEventSchemas) as RealtimeEvent[];

/** Messages envoyés par l'app (avec accusé de réception `{ ok: true }` ou `{ ok: false, code }`). */
export const RealtimeClientMessages = {
  'session.join': ev({ sessionId: id }),
  'session.leave': ev({ sessionId: id }),
} as const;
export type RealtimeAck = { ok: true } | { ok: false; code: string; message: string };

export const REALTIME_PATH = '/socket.io';
