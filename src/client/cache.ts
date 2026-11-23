import type { RealtimeEvent, RealtimePayload } from '../realtime';

/*
 * Clés de cache des données (TanStack Query ou tout autre cache), et quelles données recharger à chaque événement
 * temps réel. Les événements ne contiennent que des identifiants : l'app recharge le détail par l'API.
 */

export const queryKeys = {
  me: ['me'] as const,
  notifications: ['notifications'] as const,
  myTickets: ['me', 'tickets'] as const,
  myWallet: ['me', 'wallet'] as const,
  myLedger: ['me', 'ledger'] as const,
  pendingRatings: ['me', 'ratings', 'pending'] as const,
  gyms: ['gyms'] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  roster: (sessionId: string) => ['sessions', sessionId, 'roster'] as const,
  ticket: (id: string) => ['tickets', id] as const,
  courses: ['courses'] as const,
  course: (id: string) => ['courses', id] as const,
  promotions: ['promotions'] as const,
  coaches: ['coaches'] as const,
  coach: (id: string) => ['coaches', id] as const,
  accounts: ['accounts'] as const,
  clientWallet: (clientId: string) => ['clients', clientId, 'wallet'] as const,
  recharges: ['recharges'] as const,
  kpi: ['kpi'] as const,
};

export type QueryKey = readonly unknown[];

/** Données à recharger quand un événement arrive (préfixes : `['sessions']` recharge toutes les listes de séances). */
export function invalidationsFor<E extends RealtimeEvent>(event: E, payload: RealtimePayload<E>): QueryKey[] {
  const p = payload as Record<string, string>;
  switch (event) {
    case 'session.seats': return [queryKeys.sessions, queryKeys.session(p.sessionId!)];
    case 'course.submitted': return [queryKeys.courses];
    case 'course.reviewed':
    case 'course.cancelled': return [queryKeys.courses, queryKeys.course(p.courseId!), queryKeys.sessions, queryKeys.myTickets];
    case 'ticket.updated': return [queryKeys.myTickets, queryKeys.ticket(p.ticketId!), queryKeys.roster(p.sessionId!), queryKeys.pendingRatings];
    case 'checkin.done': return [queryKeys.roster(p.sessionId!), queryKeys.ticket(p.ticketId!)];
    case 'wallet.updated': return [queryKeys.myWallet, queryKeys.myLedger];
    case 'notification.created': return [queryKeys.notifications];
    case 'promo.changed': return [queryKeys.promotions];
    case 'kpi.changed': return [queryKeys.kpi, queryKeys.recharges];
    default: return [];
  }
}
