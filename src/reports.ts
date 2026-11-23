import { z } from 'zod';

/*
 * Tableaux de bord (phase 10) : forme du rapport `GET /reports/kpi`, partagée par l'API, MILIEU Staff (mode API)
 * et le calcul local de la démo. Montants en MILLIMES entiers (1 DT = 1 000 millimes), jours en AAAA-MM-JJ dans
 * le fuseau de la salle.
 *
 * Définitions (identiques partout) :
 * - séances : séances non annulées qui ont déjà commencé, dont le jour de début est dans la période ;
 * - places réservées : tickets « réservé », « présent » ou « absent » de ces séances ;
 * - remplissage : places réservées / places offertes ;
 * - assiduité : présents / (présents + absents) ;
 * - recettes : encaissements au comptoir du jour ; jetons vendus = jetons payés (hors jetons offerts) ;
 * - jetons consommés : jetons débités définitivement le jour du débit (présence, absence, annulation tardive) ;
 * - notes : avis visibles donnés pendant la période (la note « globale » du coach compte tous ses avis visibles).
 */

export const PAYMENT_METHODS = ['cash', 'card_terminal', 'transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REPORT_MAX_DAYS = 366;
export const REPORT_EXPORT_KINDS = ['recharges', 'sessions', 'daily'] as const;
export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int();
const nn = z.number().int().nonnegative();
const rate = z.number().min(0).max(1).nullable();

const MethodTotalsSchema = z.object({ count: nn, totalMillimes: nn });
export const ByMethodSchema = z.object({ cash: MethodTotalsSchema, card_terminal: MethodTotalsSchema, transfer: MethodTotalsSchema, other: MethodTotalsSchema });
export type ByMethod = z.infer<typeof ByMethodSchema>;

/** Indicateurs d'activité (séances, présence) : communs aux totaux, aux jours, aux salles et aux coachs. */
const ActivityShape = {
  sessions: nn,
  capacity: nn,
  booked: nn,
  attended: nn,
  noShow: nn,
  lateCancel: nn,
  fillRate: rate,
  attendanceRate: rate,
};
/** Indicateurs d'argent et de jetons. */
const MoneyShape = {
  revenueMillimes: nn,
  rechargeCount: nn,
  tokensSold: nn,
  bonusTokens: nn,
  tokensConsumed: nn,
};

export const KpiTotalsSchema = z.object({
  ...ActivityShape,
  ...MoneyShape,
  byMethod: ByMethodSchema,
  consumedByReason: z.object({ attended: nn, no_show: nn, late_cancel: nn }),
  ratingAvg: z.number().min(1).max(5).nullable(),
  ratingCount: nn,
});
export type KpiTotals = z.infer<typeof KpiTotalsSchema>;

export const KpiDaySchema = z.object({ date: day, ...ActivityShape, ...MoneyShape, byMethod: ByMethodSchema });
export type KpiDay = z.infer<typeof KpiDaySchema>;

export const KpiGymSchema = z.object({ gymId: z.string(), name: z.string(), city: z.string(), ...ActivityShape, ...MoneyShape, ratingAvg: z.number().nullable(), ratingCount: nn });
export type KpiGym = z.infer<typeof KpiGymSchema>;

export const KpiCoachSchema = z.object({
  coachId: z.string(), gymId: z.string(), firstName: z.string(), lastName: z.string(),
  ...ActivityShape,
  /** Avis donnés pendant la période. */
  ratingAvg: z.number().nullable(), ratingCount: nn,
  /** Tous les avis visibles du coach (note affichée sur son profil). */
  ratingAvgAllTime: z.number().nullable(), ratingCountAllTime: nn,
});
export type KpiCoach = z.infer<typeof KpiCoachSchema>;

/** Caisse par agent d'accueil (ou administrateur) sur la période. */
export const KpiCashierSchema = z.object({
  cashierId: z.string(), gymId: z.string(), firstName: z.string(), lastName: z.string(), role: z.string(),
  count: nn, totalMillimes: nn, tokens: nn, bonusTokens: nn, byMethod: ByMethodSchema,
});
export type KpiCashier = z.infer<typeof KpiCashierSchema>;

export const KpiReportSchema = z.object({
  /** `null` : tout le réseau (administrateur). */
  gymId: z.string().nullable(),
  from: day,
  to: day,
  days: int.positive(),
  generatedAt: z.string(),
  totals: KpiTotalsSchema,
  byDay: z.array(KpiDaySchema),
  byGym: z.array(KpiGymSchema),
  byCoach: z.array(KpiCoachSchema),
  byCashier: z.array(KpiCashierSchema),
}).passthrough();
export type KpiReport = z.infer<typeof KpiReportSchema>;

export interface KpiQuery {
  /** Premier jour inclus (AAAA-MM-JJ). Par défaut : 29 jours avant `to`. */
  from?: string;
  /** Dernier jour inclus (AAAA-MM-JJ). Par défaut : aujourd'hui. */
  to?: string;
  /** Administrateur : une salle, ou tout le réseau si absent. Accueil : toujours sa salle. */
  gymId?: string;
}

/* ------------------------------- Aides de calcul partagées ------------------------------- */

export const emptyByMethod = (): ByMethod => ({
  cash: { count: 0, totalMillimes: 0 }, card_terminal: { count: 0, totalMillimes: 0 },
  transfer: { count: 0, totalMillimes: 0 }, other: { count: 0, totalMillimes: 0 },
});

/** Taux arrondi à 4 décimales ; `null` si le dénominateur est nul (rien à mesurer, pas 0 %). */
export const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10_000) / 10_000 : null);

/** Moyenne arrondie à 2 décimales ; `null` sans avis. */
export const average = (sum: number, count: number) => (count > 0 ? Math.round((sum / count) * 100) / 100 : null);

/** Jour suivant / précédent (AAAA-MM-JJ, calendrier pur). */
export const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Nombre de jours de `from` à `to` inclus. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;

/** Tous les jours de la période, dans l'ordre. */
export const eachDay = (from: string, to: string) => Array.from({ length: Math.max(0, daysBetween(from, to)) }, (_, i) => shiftDay(from, i));

/** Périodes proposées par les tableaux de bord, à partir du jour courant de la salle. */
export function reportPeriod(kind: 'today' | '7d' | '30d' | 'month' | 'last_month', today: string): { from: string; to: string } {
  switch (kind) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: shiftDay(today, -6), to: today };
    case '30d': return { from: shiftDay(today, -29), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_month': {
      const first = `${today.slice(0, 8)}01`;
      const last = shiftDay(first, -1);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
  }
}

/** Dinars affichables depuis des millimes (« 1 234,500 DT » n'est pas utile au tableau de bord : 2 décimales max). */
export const millimesToTnd = (m: number) => Math.round(m) / 1000;
