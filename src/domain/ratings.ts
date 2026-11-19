import type { Account, Rating, Ticket } from '../network';

/* Évaluations des coachs : qui peut noter, et comment la note d'un coach est calculée. */

/** Délai pour évaluer une séance après sa fin. */
export const RATING_WINDOW_DAYS = 30;

/** Le client peut-il évaluer ce ticket ? (présent, séance terminée, pas encore noté, moins de 30 jours) */
export function canRateTicket(ticket: Pick<Ticket, 'status'>, sessionEndMs: number, alreadyRated: boolean, now = Date.now()) {
  return ticket.status === 'attended' && sessionEndMs <= now && now - sessionEndMs < RATING_WINDOW_DAYS * 864e5 && !alreadyRated;
}

export interface CoachRating { avg: number; count: number; distribution: number[]; reviews: Rating[] }

/** Note moyenne (arrondie au dixième), répartition 1 à 5 étoiles et avis écrits, du plus récent au plus ancien. */
export function aggregateRatings(ratings: Rating[]): CoachRating {
  const list = [...ratings].sort((a, b) => b.at.localeCompare(a.at));
  const distribution = [1, 2, 3, 4, 5].map((s) => list.filter((r) => r.stars === s).length);
  const avg = list.length ? Math.round((list.reduce((n, r) => n + r.stars, 0) / list.length) * 10) / 10 : 0;
  return { avg, count: list.length, distribution, reviews: list.filter((r) => r.comment) };
}

export const fullName = (a?: Pick<Account, 'firstName' | 'lastName'>) => (a ? `${a.firstName} ${a.lastName}`.trim() : '—');
