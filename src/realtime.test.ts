import { describe, expect, it } from 'vitest';
import { REALTIME_EVENTS, RealtimeClientMessages, RealtimeEventSchemas } from './realtime';

const A = '0190f0a0-0000-7000-8000-000000000001';
const B = '0190f0a0-0000-7000-8000-000000000002';

describe('événements temps réel', () => {
  it('les 9 événements du plan, plus la fin de session', () => {
    expect(REALTIME_EVENTS).toEqual([
      'session.seats', 'course.submitted', 'course.reviewed', 'course.cancelled', 'ticket.updated',
      'checkin.done', 'wallet.updated', 'notification.created', 'promo.changed', 'kpi.changed', 'session.revoked',
    ]);
  });

  it('identifiants et compteurs acceptés', () => {
    expect(RealtimeEventSchemas['session.seats'].parse({ sessionId: A, gymId: B, capacity: 8, seatsTaken: 3, seatsLeft: 5, status: 'scheduled' }).seatsLeft).toBe(5);
    expect(RealtimeEventSchemas['wallet.updated'].parse({ gymId: B, available: 7, held: 3 })).toEqual({ gymId: B, available: 7, held: 3 });
    expect(RealtimeClientMessages['session.join'].parse({ sessionId: A })).toEqual({ sessionId: A });
  });

  it('un champ en trop (donnée personnelle) est refusé, pas ignoré', () => {
    expect(() => RealtimeEventSchemas['checkin.done'].parse({ ticketId: A, sessionId: B, gymId: B, clientName: 'Nour' })).toThrow();
    expect(() => RealtimeEventSchemas['wallet.updated'].parse({ gymId: B, available: 7, held: 3, phone: '+216' })).toThrow();
  });

  it('identifiant invalide ou statut inconnu refusé', () => {
    expect(() => RealtimeEventSchemas['course.reviewed'].parse({ courseId: 'abc', gymId: B, coachId: A, status: 'approved' })).toThrow();
    expect(() => RealtimeEventSchemas['course.reviewed'].parse({ courseId: A, gymId: B, coachId: A, status: 'pending' })).toThrow();
  });
});
