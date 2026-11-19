import type { Ticket } from '../network';

/*
 * Règles des tickets : places occupées, annulation, présence (scan) et absences.
 * Fonctions pures, sans base de données : l'app et l'API les appliquent de la même façon.
 */

/** Statuts qui occupent une place dans la séance. */
export const TAKES_SEAT: readonly Ticket['status'][] = ['booked', 'attended', 'no_show'];

/** Présence validable de 12 h avant le début… */
export const CHECKIN_BEFORE_H = 12;
/** …jusqu'à 1 h après la fin de la séance. */
export const CHECKIN_AFTER_H = 1;

/** Fenêtre pendant laquelle un ticket peut être scanné. */
export function checkInWindow(start: Date, durationMin: number) {
  return {
    opens: new Date(start.getTime() - CHECKIN_BEFORE_H * 3600e3),
    closes: new Date(start.getTime() + (durationMin + CHECKIN_AFTER_H * 60) * 60e3),
  };
}

export type CheckInTiming = 'too_early' | 'open' | 'too_late';

export function checkInTiming(start: Date, durationMin: number, now = Date.now()): CheckInTiming {
  const { opens, closes } = checkInWindow(start, durationMin);
  if (now < opens.getTime()) return 'too_early';
  if (now > closes.getTime()) return 'too_late';
  return 'open';
}

/**
 * Annulation par le client : `started` si la séance a commencé (refusée),
 * sinon `late` si on est à moins de `cancelHours` du début (jetons conservés par la salle).
 */
export function cancellationPolicy(occurrenceAt: string | Date, cancelHours: number, now = Date.now()) {
  const hoursLeft = (new Date(occurrenceAt).getTime() - now) / 3600e3;
  return { hoursLeft, started: hoursLeft <= 0, late: hoursLeft > 0 && hoursLeft < cancelHours };
}

/** Un ticket réservé dont la séance est finie depuis plus d'1 h devient une absence (jetons débités). */
export function isNoShowDue(ticket: Pick<Ticket, 'status' | 'occurrenceAt'>, durationMin: number | undefined, now = Date.now()) {
  if (ticket.status !== 'booked') return false;
  const end = new Date(ticket.occurrenceAt).getTime() + ((durationMin ?? 60) + CHECKIN_AFTER_H * 60) * 60e3;
  return end < now;
}

/** Code court lisible d'un ticket : `MLU-XXXX-XXXX` (sans 0/O ni 1/I pour éviter les confusions). */
export function generateTicketCode(random: () => number = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  return `MLU-${part()}-${part()}`;
}
