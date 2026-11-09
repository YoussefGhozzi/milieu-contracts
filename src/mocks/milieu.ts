import { z } from 'zod';
import {
  BookingSchema, ClassSessionSchema, LedgerEntrySchema, MemberSchema, NotificationSchema, StudioSchema, WalletSchema,
  type Booking, type ClassSession, type LedgerEntry, type Studio,
} from '../schemas';

/*
 * Données simulées du studio MILIEU pour la démo (aucun backend).
 * Tout est généré par rapport à « maintenant » et de façon déterministe : la démo montre toujours
 * un planning à jour, avec les mêmes cours complets d'une fois sur l'autre.
 */

export const studio: Studio = StudioSchema.parse({
  name: 'MILIEU',
  address: 'Phosphor District, Tunis',
  cancelHours: 12,
  rooms: [
    { id: 'room-lagree', name: 'Studio Lagree', kind: 'lagree', capacity: 5 },
    { id: 'room-multi', name: 'Studio Multi', kind: 'multi', capacity: 14 },
  ],
  disciplines: [
    { id: 'lagree', name: 'Lagree', roomKind: 'lagree', tokenCost: 4, durationMin: 50, intensity: 3, description: 'Renforcement lent et intense sur Megaformer, 5 machines seulement.' },
    { id: 'hot-sculpt', name: 'Hot Sculpt', roomKind: 'multi', tokenCost: 3, durationMin: 45, intensity: 3, description: 'Sculpt cardio dans une salle chauffée, poids légers et haute énergie.' },
    { id: 'mat-pilates', name: 'Mat Pilates', roomKind: 'multi', tokenCost: 2, durationMin: 50, intensity: 2, description: 'Pilates au sol : gainage, posture et contrôle.' },
    { id: 'mobility', name: 'Mobility', roomKind: 'multi', tokenCost: 2, durationMin: 45, intensity: 1, description: 'Amplitude, respiration et récupération active.' },
    { id: 'functional', name: 'Functional', roomKind: 'multi', tokenCost: 3, durationMin: 50, intensity: 3, description: 'Circuits fonctionnels au poids du corps et kettlebells.' },
  ],
  coaches: [
    { id: 'c-yasmine', firstName: 'Yasmine', lastName: 'Ben Ali', bio: 'Coach Lagree certifiée, 6 ans d’expérience.', disciplineIds: ['lagree', 'mat-pilates'] },
    { id: 'c-mehdi', firstName: 'Mehdi', lastName: 'Trabelsi', bio: 'Ancien athlète, spécialiste du conditionnement.', disciplineIds: ['functional', 'hot-sculpt'] },
    { id: 'c-ines', firstName: 'Inès', lastName: 'Mansour', bio: 'Professeure de Pilates et de mobilité.', disciplineIds: ['mat-pilates', 'mobility'] },
    { id: 'c-amine', firstName: 'Amine', lastName: 'Gharbi', bio: 'Préparateur physique, passionné de Lagree.', disciplineIds: ['lagree', 'functional'] },
    { id: 'c-lina', firstName: 'Lina', lastName: 'Bouaziz', bio: 'Danseuse et coach Hot Sculpt.', disciplineIds: ['hot-sculpt', 'mobility'] },
    { id: 'c-karim', firstName: 'Karim', lastName: 'Haddad', bio: 'Kinésithérapeute, cours de mobilité.', disciplineIds: ['mobility'] },
    { id: 'c-salma', firstName: 'Salma', lastName: 'Jaziri', bio: 'Coach Lagree, précision et technique.', disciplineIds: ['lagree'] },
    { id: 'c-omar', firstName: 'Omar', lastName: 'Chaabane', bio: 'Coach functional et hot sculpt.', disciplineIds: ['functional', 'hot-sculpt'] },
  ],
  packs: [
    { id: 'discover', name: 'DISCOVER', tokens: 10, priceTnd: 100 },
    { id: 'move', name: 'MOVE', tokens: 25, priceTnd: 225 },
    { id: 'routine', name: 'ROUTINE', tokens: 40, priceTnd: 340, badge: 'popular' },
    { id: 'all-in', name: 'ALL IN', tokens: 60, priceTnd: 480, badge: 'best_value' },
  ],
});

/** Créneaux types : [heure, minute, salle, disciplines possibles, coachs possibles]. */
const SLOTS: [number, number, string, string[], string[]][] = [
  [7, 0, 'room-lagree', ['lagree'], ['c-yasmine', 'c-salma']],
  [7, 30, 'room-multi', ['mobility', 'mat-pilates'], ['c-ines', 'c-karim']],
  [9, 0, 'room-lagree', ['lagree'], ['c-amine', 'c-salma']],
  [10, 0, 'room-multi', ['mat-pilates', 'mobility'], ['c-ines', 'c-lina']],
  [12, 30, 'room-lagree', ['lagree'], ['c-yasmine', 'c-amine']],
  [12, 45, 'room-multi', ['functional', 'hot-sculpt'], ['c-mehdi', 'c-omar']],
  [18, 0, 'room-lagree', ['lagree'], ['c-salma', 'c-yasmine']],
  [18, 30, 'room-multi', ['hot-sculpt', 'functional'], ['c-lina', 'c-mehdi']],
  [19, 15, 'room-lagree', ['lagree'], ['c-amine', 'c-yasmine']],
  [20, 0, 'room-multi', ['mat-pilates', 'mobility'], ['c-ines', 'c-karim']],
];

/** Pseudo-aléatoire déterministe (même résultat à chaque lancement). */
const rand = (seed: number) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Date locale AAAA-MM-JJ (pas UTC : en Tunisie, minuit local tombe la veille en UTC). */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function buildSchedule(now = new Date(), days = 14): ClassSession[] {
  const today = startOfDay(now);
  const out: ClassSession[] = [];
  for (let day = -3; day < days; day++) {
    const date = addDays(today, day);
    SLOTS.forEach(([h, m, roomId, disciplines, coaches], i) => {
      const dayKey = Math.floor(date.getTime() / 864e5);
      const seed = dayKey * 31 + i;
      const disciplineId = disciplines[Math.floor(rand(seed) * disciplines.length)];
      const coachId = coaches[Math.floor(rand(seed + 7) * coaches.length)];
      const discipline = studio.disciplines.find((d) => d.id === disciplineId)!;
      const room = studio.rooms.find((r) => r.id === roomId)!;
      const startsAt = new Date(date); startsAt.setHours(h, m, 0, 0);
      // Les cours du soir se remplissent plus ; environ un cours sur cinq est complet.
      const fill = Math.min(1, rand(seed + 13) * 0.9 + (h >= 18 ? 0.35 : 0.1));
      const booked = fill > 0.95 ? room.capacity : Math.floor(fill * room.capacity);
      out.push({
        id: `s-${isoDate(date)}-${i}`,
        disciplineId, coachId, roomId,
        startsAt: startsAt.toISOString(),
        durationMin: discipline.durationMin,
        capacity: room.capacity,
        booked,
        tokenCost: discipline.tokenCost,
        status: 'scheduled',
      });
    });
  }
  return z.array(ClassSessionSchema).parse(out);
}

export interface DemoState {
  member: z.infer<typeof MemberSchema>;
  wallet: z.infer<typeof WalletSchema>;
  sessions: ClassSession[];
  bookings: Booking[];
  ledger: LedgerEntry[];
  notifications: z.infer<typeof NotificationSchema>[];
}

/** Le compte de démo : un membre régulier avec un historique pour remplir chaque écran. */
export function buildDemoState(now = new Date()): DemoState {
  const sessions = buildSchedule(now);
  const today = startOfDay(now);
  const at = (daysAgo: number, h = 10) => { const d = addDays(today, -daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };

  const future = sessions.filter((s) => new Date(s.startsAt) > now);
  const past = sessions.filter((s) => new Date(s.startsAt) < now);
  const pick = (list: ClassSession[], disciplineId: string, after = 0) =>
    list.filter((s) => s.disciplineId === disciplineId)[after] ?? list[after];

  const upcomingLagree = pick(future.filter((s) => s.booked < s.capacity), 'lagree', 1);
  const upcomingPilates = pick(future.filter((s) => s.booked < s.capacity), 'mat-pilates', 1);
  const pastA = pick(past, 'lagree', 0);
  const pastB = pick(past, 'hot-sculpt', 0) ?? past[1];

  const bookings: Booking[] = [
    { id: 'b-1', sessionId: upcomingLagree.id, status: 'booked', qr: 'MILIEU-DEMO-b-1', createdAt: at(2) },
    { id: 'b-2', sessionId: upcomingPilates.id, status: 'booked', qr: 'MILIEU-DEMO-b-2', createdAt: at(1) },
    { id: 'b-3', sessionId: pastA.id, status: 'attended', createdAt: at(5) },
    { id: 'b-4', sessionId: pastB.id, status: 'late_cancel', createdAt: at(4) },
  ];
  // La démo réserve « pour de vrai » dans les données : les places réservées comptent.
  for (const b of bookings) {
    const s = sessions.find((x) => x.id === b.sessionId)!;
    if (b.status === 'booked' && s.booked < s.capacity) s.booked += 1;
  }

  const ledger: LedgerEntry[] = [
    { id: 'l-1', at: at(20), type: 'purchase', amount: 25, label: 'Pack MOVE' },
    { id: 'l-2', at: at(20), type: 'bonus', amount: 4, label: 'Bonus de bienvenue' },
    { id: 'l-3', at: at(5), type: 'hold', amount: -4, label: 'Lagree' },
    { id: 'l-4', at: at(4), type: 'hold', amount: -3, label: 'Hot Sculpt (annulation tardive)' },
    { id: 'l-5', at: at(2), type: 'hold', amount: -4, label: 'Lagree' },
    { id: 'l-6', at: at(1), type: 'hold', amount: -2, label: 'Mat Pilates' },
  ];

  const expiry = isoDate(addDays(today, 10));
  return {
    member: MemberSchema.parse({
      id: 'm-demo', firstName: 'Nour', lastName: 'Ben Salem', email: 'nour@example.com',
      phone: '+216 20 000 000', memberSince: isoDate(addDays(today, -60)), lang: 'fr',
    }),
    wallet: WalletSchema.parse({ purchased: 12, bonus: [{ amount: 4, expiresAt: expiry }], reward: 0 }),
    sessions,
    bookings: z.array(BookingSchema).parse(bookings),
    ledger: z.array(LedgerEntrySchema).parse(ledger),
    notifications: z.array(NotificationSchema).parse([
      { id: 'n-1', at: at(0, 8), kind: 'reminder', title: 'Cours bientôt', body: 'Votre prochain cours approche. Pensez à arriver 10 minutes avant.', read: false },
      { id: 'n-2', at: at(1), kind: 'tokens_credited', title: 'Bonus de bienvenue', body: '4 jetons bonus ajoutés, valables 10 jours.', read: true },
      { id: 'n-3', at: at(3), kind: 'info', title: 'Nouveau : Hot Sculpt du soir', body: 'Un créneau à 18h30 s’ajoute au planning.', read: true },
    ]),
  };
}
