import { describe, expect, it } from 'vitest';
import type { Promotion, Rating } from '../network';
import {
  aggregateRatings, cancellationPolicy, canRateTicket, checkInTiming, checkInWindow, formatTnd, fullName, generateTicketCode,
  isNoShowDue, lastDay, nthOccurrence, occurrenceCount, occurrences, overlaps, promoLabel, promoState, quoteRecharge, sessionKey,
} from './index';

const H = 3600e3;
const D = 24 * H;
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min);

describe('récurrence', () => {
  it('hebdomadaire : +7 jours, même heure', () => {
    const first = at(2027, 1, 4, 18, 30);
    expect(nthOccurrence(first, 'weekly', 3)).toEqual(at(2027, 1, 25, 18, 30));
  });

  it('mensuel le 31 → dernier jour des mois plus courts', () => {
    const first = at(2027, 1, 31);
    expect(nthOccurrence(first, 'monthly', 1)).toEqual(at(2027, 2, 28));
    expect(nthOccurrence(first, 'monthly', 3)).toEqual(at(2027, 4, 30));
    expect(nthOccurrence(first, 'monthly', 2)).toEqual(at(2027, 3, 31));
  });

  it('annuel le 29 février → 28 février les années non bissextiles', () => {
    expect(nthOccurrence(at(2028, 2, 29), 'yearly', 1)).toEqual(at(2029, 2, 28));
    expect(nthOccurrence(at(2028, 2, 29), 'yearly', 4)).toEqual(at(2032, 2, 29));
  });

  it('ponctuel : une seule séance, fin = début', () => {
    const c = { startsAt: at(2027, 3, 1).toISOString(), recurrence: 'once' as const, until: null, durationMin: 60 };
    expect(occurrenceCount(c)).toBe(1);
    expect(lastDay(c)).toEqual(at(2027, 3, 1));
  });

  it('date de fin incluse jusqu’à 23:59:59', () => {
    const c = { startsAt: at(2027, 1, 4).toISOString(), recurrence: 'weekly' as const, until: '2027-01-25', durationMin: 60 };
    expect(occurrenceCount(c)).toBe(4);
  });

  it('sans date de fin : 26 semaines par défaut pour un cours hebdomadaire', () => {
    const c = { startsAt: at(2027, 1, 4).toISOString(), recurrence: 'weekly' as const, until: null, durationMin: 60 };
    expect(occurrenceCount(c)).toBe(27);
  });

  it('occurrences : garde les séances qui chevauchent la période (même commencées)', () => {
    const c = { startsAt: at(2027, 1, 4, 10).toISOString(), recurrence: 'weekly' as const, until: '2027-03-01', durationMin: 60 };
    const list = occurrences(c, at(2027, 1, 11, 10, 30), at(2027, 1, 19));
    expect(list).toEqual([at(2027, 1, 11, 10), at(2027, 1, 18, 10)]);
  });

  it('clé de séance stable et chevauchement', () => {
    expect(sessionKey('c-1', '2027-01-04T09:00:00.000Z')).toBe('c-1@2027-01-04T09:00:00.000Z');
    expect(overlaps(at(2027, 1, 1, 10), 60, at(2027, 1, 1, 10, 59), at(2027, 1, 1, 12))).toBe(true);
    expect(overlaps(at(2027, 1, 1, 10), 60, at(2027, 1, 1, 11), at(2027, 1, 1, 12))).toBe(false);
  });
});

describe('tickets', () => {
  const start = at(2027, 5, 10, 18);

  it('fenêtre de scan : 12 h avant → 1 h après la fin', () => {
    const w = checkInWindow(start, 45);
    expect(w.opens).toEqual(at(2027, 5, 10, 6));
    expect(w.closes).toEqual(at(2027, 5, 10, 19, 45));
    expect(checkInTiming(start, 45, start.getTime() - 13 * H)).toBe('too_early');
    expect(checkInTiming(start, 45, start.getTime() - 12 * H)).toBe('open');
    expect(checkInTiming(start, 45, w.closes.getTime())).toBe('open');
    expect(checkInTiming(start, 45, w.closes.getTime() + 1)).toBe('too_late');
  });

  it('annulation : à temps, tardive, ou impossible une fois commencée', () => {
    expect(cancellationPolicy(start, 24, start.getTime() - 25 * H)).toMatchObject({ late: false, started: false });
    expect(cancellationPolicy(start, 24, start.getTime() - 23 * H)).toMatchObject({ late: true, started: false });
    expect(cancellationPolicy(start, 24, start.getTime())).toMatchObject({ late: false, started: true });
  });

  it('absence : seulement un ticket réservé, 1 h après la fin', () => {
    const t = { status: 'booked' as const, occurrenceAt: start.toISOString() };
    const end = start.getTime() + 60 * 60e3;
    expect(isNoShowDue(t, 60, end + H)).toBe(false);
    expect(isNoShowDue(t, 60, end + H + 1)).toBe(true);
    expect(isNoShowDue({ ...t, status: 'attended' }, 60, end + 10 * D)).toBe(false);
    expect(isNoShowDue(t, undefined, start.getTime() + 2 * H + 1)).toBe(true);
  });

  it('code de ticket lisible, sans caractères ambigus', () => {
    for (let i = 0; i < 200; i++) expect(generateTicketCode()).toMatch(/^MLU-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(generateTicketCode(() => 0)).toBe('MLU-AAAA-AAAA');
  });
});

describe('prix et promotions', () => {
  const now = at(2026, 11, 19);
  const promo = (p: Partial<Promotion>): Promotion => ({
    id: 'p', gymId: 'g', title: 'Promo', description: '', kind: 'percent_off', value: 20, minTokens: 0,
    startsOn: '2026-11-01', endsOn: '2026-11-30', active: true, createdAt: now.toISOString(), createdBy: 'u-admin', ...p,
  });

  it('format des dinars', () => {
    expect(formatTnd(225)).toBe('225 DT');
    expect(formatTnd(8.5)).toBe('8,5 DT');
    expect(formatTnd(1250.125)).toBe('1 250,125 DT');
  });

  it('état d’une promotion selon la date du jour', () => {
    expect(promoState(promo({}), now)).toBe('active');
    expect(promoState(promo({ startsOn: '2026-11-20' }), now)).toBe('scheduled');
    expect(promoState(promo({ endsOn: '2026-11-18' }), now)).toBe('expired');
    expect(promoState(promo({ active: false }), now)).toBe('disabled');
    expect(promoState(promo({ startsOn: '2026-11-19', endsOn: '2026-11-19' }), now)).toBe('active');
  });

  it('devis : 40 jetons à 10 DT, −20 % et +5 offerts = 320 DT', () => {
    const q = quoteRecharge(10, [promo({ value: 20, minTokens: 20 }), promo({ id: 'b', kind: 'bonus_tokens', value: 5, minTokens: 40 })], 40, now);
    expect(q).toMatchObject({ base: 400, discount: 80, total: 320, bonus: 5 });
    expect(q.percentPromo?.id).toBe('p');
    expect(q.bonusPromo?.id).toBe('b');
  });

  it('devis : minimum de jetons non atteint, promo programmée ou désactivée → ignorées', () => {
    const promos = [promo({ minTokens: 20 }), promo({ id: 's', startsOn: '2026-12-01', endsOn: '2026-12-31' }), promo({ id: 'x', active: false })];
    expect(quoteRecharge(10, promos, 10, now)).toMatchObject({ total: 100, discount: 0, bonus: 0 });
  });

  it('devis : la meilleure remise l’emporte, plafonnée à 90 %, au millime près', () => {
    expect(quoteRecharge(9.5, [promo({ value: 10 }), promo({ id: 'best', value: 30 })], 10, now)).toMatchObject({ base: 95, discount: 28.5, total: 66.5 });
    expect(quoteRecharge(10, [promo({ value: 100 })], 1, now)).toMatchObject({ discount: 9, total: 1 });
    expect(quoteRecharge(8.333, [], 3, now).total).toBe(24.999);
  });

  it('libellé des promotions', () => {
    expect(promoLabel({ kind: 'percent_off', value: 20, minTokens: 20 })).toBe('−20 % sur les recharges dès 20 jetons');
    expect(promoLabel({ kind: 'bonus_tokens', value: 5, minTokens: 40 })).toBe('+5 jetons offerts dès 40 jetons achetés');
  });
});

describe('évaluations', () => {
  const end = at(2026, 11, 10, 19).getTime();

  it('seulement une séance suivie, terminée, non notée, depuis moins de 30 jours', () => {
    expect(canRateTicket({ status: 'attended' }, end, false, end + H)).toBe(true);
    expect(canRateTicket({ status: 'attended' }, end, false, end - 1)).toBe(false);
    expect(canRateTicket({ status: 'attended' }, end, true, end + H)).toBe(false);
    expect(canRateTicket({ status: 'no_show' }, end, false, end + H)).toBe(false);
    expect(canRateTicket({ status: 'attended' }, end, false, end + 30 * D)).toBe(false);
  });

  it('moyenne au dixième, répartition et avis écrits du plus récent au plus ancien', () => {
    const r = (stars: number, day: number, comment?: string): Rating => ({
      id: `r${day}`, gymId: 'g', coachId: 'c', clientId: 'u', courseId: 'k', ticketId: `t${day}`,
      occurrenceAt: at(2026, 11, day).toISOString(), stars, comment, at: at(2026, 11, day).toISOString(),
    });
    const agg = aggregateRatings([r(5, 1, 'Top'), r(4, 3), r(5, 2, 'Super')]);
    expect(agg).toMatchObject({ avg: 4.7, count: 3, distribution: [0, 0, 0, 1, 2] });
    expect(agg.reviews.map((x) => x.comment)).toEqual(['Super', 'Top']);
    expect(aggregateRatings([])).toMatchObject({ avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] });
  });

  it('nom complet', () => {
    expect(fullName({ firstName: 'Nour', lastName: 'Ben Salem' })).toBe('Nour Ben Salem');
    expect(fullName(undefined)).toBe('—');
  });
});
