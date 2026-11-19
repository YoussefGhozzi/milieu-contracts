import type { Promotion, TokenMove } from '../network';

/*
 * Prix du jeton, promotions et devis de recharge au comptoir.
 * Le devis est calculé par l'app (affichage) ET recalculé par l'API (montant réellement encaissé).
 */

/** « 225 DT », « 8,500 DT ». */
export const formatTnd = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/0+$/, '').replace('.', ',');
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} DT`;
};

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export const todayYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type PromoState = 'active' | 'scheduled' | 'expired' | 'disabled';

export function promoState(p: Pick<Promotion, 'active' | 'startsOn' | 'endsOn'>, now = new Date()): PromoState {
  if (!p.active) return 'disabled';
  const today = todayYmd(now);
  if (today < p.startsOn) return 'scheduled';
  if (today > p.endsOn) return 'expired';
  return 'active';
}

export const promoLabel = (p: Pick<Promotion, 'kind' | 'value' | 'minTokens'>) =>
  p.kind === 'percent_off' ? `−${p.value} % sur les recharges${p.minTokens ? ` dès ${p.minTokens} jetons` : ''}` : `+${p.value} jetons offerts dès ${p.minTokens} jetons achetés`;

export const METHOD_LABEL: Record<NonNullable<TokenMove['method']>, string> = { cash: 'Espèces', card_terminal: 'TPE (carte)', transfer: 'Virement', other: 'Autre' };

export interface RechargeQuote {
  amount: number; unitPrice: number; base: number; discount: number; total: number; bonus: number;
  percentPromo?: Promotion; bonusPromo?: Promotion;
}

/** Remise maximale appliquée, quelle que soit la promotion. */
export const MAX_DISCOUNT_PERCENT = 90;

/**
 * Prix d'une recharge : prix unitaire de la salle, meilleure remise et meilleur bonus parmi les promotions
 * **actives** de la salle dont le minimum de jetons est atteint.
 */
export function quoteRecharge(unitPrice: number, promotions: Promotion[], amount: number, now = new Date()): RechargeQuote {
  const base = Math.round(amount * unitPrice * 1000) / 1000;
  const promos = promotions.filter((p) => promoState(p, now) === 'active' && amount >= p.minTokens);
  const percentPromo = promos.filter((p) => p.kind === 'percent_off').sort((a, b) => b.value - a.value)[0];
  const bonusPromo = promos.filter((p) => p.kind === 'bonus_tokens').sort((a, b) => b.value - a.value)[0];
  const discount = percentPromo ? Math.round(base * Math.min(percentPromo.value, MAX_DISCOUNT_PERCENT) * 10) / 1000 : 0;
  return { amount, unitPrice, base, discount, total: Math.round((base - discount) * 1000) / 1000, bonus: bonusPromo?.value ?? 0, percentPromo, bonusPromo };
}
