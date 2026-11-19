import type { Course, Recurrence } from '../network';

/*
 * Règles de récurrence des cours : partagées par l'app (affichage, démo locale) et l'API (génération des séances).
 * Toutes les fonctions sont pures : mêmes entrées → même résultat.
 */

/** Durée de répétition par défaut d'un cours sans date de fin. */
export const DEFAULT_SPAN: Record<Recurrence, { months?: number; years?: number; weeks?: number }> = {
  once: {},
  weekly: { weeks: 26 },
  monthly: { months: 12 },
  yearly: { years: 3 },
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = { once: 'Ponctuel', weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel' };

/** n-ième occurrence d'un cours (heure locale conservée ; un 31 sans 31 → dernier jour du mois). */
export function nthOccurrence(first: Date, recurrence: Recurrence, n: number): Date {
  const d = new Date(first);
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7 * n);
  if (recurrence === 'monthly' || recurrence === 'yearly') {
    const months = recurrence === 'monthly' ? n : 12 * n;
    const day = first.getDate();
    d.setDate(1);
    d.setMonth(first.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d;
}

/** Date de la dernière séance possible d'un cours. */
export function lastDay(course: Pick<Course, 'startsAt' | 'recurrence' | 'until'>): Date {
  const first = new Date(course.startsAt);
  if (course.recurrence === 'once') return first;
  if (course.until) return new Date(`${course.until}T23:59:59`);
  const s = DEFAULT_SPAN[course.recurrence];
  const d = new Date(first);
  if (s.weeks) d.setDate(d.getDate() + 7 * s.weeks);
  if (s.months) d.setMonth(d.getMonth() + s.months);
  if (s.years) d.setFullYear(d.getFullYear() + s.years);
  return d;
}

/** Débuts des séances d'un cours qui chevauchent [from, to]. */
export function occurrences(course: Pick<Course, 'startsAt' | 'recurrence' | 'until' | 'durationMin'>, from: Date, to: Date): Date[] {
  const first = new Date(course.startsAt);
  const end = lastDay(course);
  const out: Date[] = [];
  for (let i = 0; i < 1000; i++) {
    const d = nthOccurrence(first, course.recurrence, i);
    if (d > end || d > to) break;
    if (d.getTime() + course.durationMin * 60e3 >= from.getTime()) out.push(d);
    if (course.recurrence === 'once') break;
  }
  return out;
}

/** Nombre total de séances d'un cours. */
export const occurrenceCount = (course: Pick<Course, 'startsAt' | 'recurrence' | 'until' | 'durationMin'>) =>
  occurrences(course, new Date(course.startsAt), lastDay(course)).length;

/** Identifiant stable d'une séance : `<coursId>@<début ISO>`. */
export const sessionKey = (courseId: string, at: Date | string) => `${courseId}@${new Date(at).toISOString()}`;

/** Deux créneaux [début, début + durée[ se chevauchent-ils ? */
export const overlaps = (aStart: Date, aDurationMin: number, bStart: Date, bEnd: Date) =>
  aStart < bEnd && new Date(aStart.getTime() + aDurationMin * 60e3) > bStart;
