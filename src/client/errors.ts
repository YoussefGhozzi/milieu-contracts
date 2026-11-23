/*
 * Erreurs de l'API (format « problem+json ») et messages pour l'utilisateur.
 * L'API rédige déjà ses messages en français (`detail`) ; ici, l'anglais et l'arabe pour les cas courants,
 * et un message générique sûr pour le reste (jamais un message technique à l'écran).
 */

export type ApiLang = 'fr' | 'en' | 'ar';

export class ApiProblem extends Error {
  constructor(
    /** Statut HTTP (0 : réseau injoignable ou délai dépassé). */
    readonly status: number,
    /** Code stable (`WALLET_INSUFFICIENT`, `NETWORK_ERROR`…), à utiliser dans le code de l'app. */
    readonly code: string,
    /** Message en français rédigé par l'API. */
    readonly detail: string,
    readonly fieldErrors: Record<string, string[]> = {},
    /** Champs supplémentaires selon le code (`missing`, `quote`, `opensAt`…). */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail || code);
    this.name = 'ApiProblem';
  }

  get offline() { return this.status === 0; }
}

export const isApiProblem = (e: unknown): e is ApiProblem => e instanceof ApiProblem;

type Messages = Record<string, string>;

const EN: Messages = {
  NETWORK_ERROR: 'No connection. Check your internet and try again.',
  TIMEOUT: 'The server is taking too long. Try again in a moment.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Try again in a moment.',
  INTERNAL: 'Something went wrong. Try again.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  VALIDATION_ERROR: 'Some information is invalid.',
  NOT_FOUND: 'Not found.',
  FORBIDDEN_ROLE: 'Your role does not allow this action.',
  FORBIDDEN_OTHER_GYM: 'This belongs to another gym.',
  AUTH_INVALID: 'Wrong email or password.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  AUTH_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_SESSION_REVOKED: 'You have been signed out. Please sign in again.',
  AUTH_REFRESH_REUSED: 'Session closed for security. Please sign in again.',
  AUTH_ACCOUNT_DISABLED: 'This account is disabled. Contact your gym’s front desk.',
  AUTH_GYM_DISABLED: 'This gym is closed for now.',
  PASSWORD_CHANGE_REQUIRED: 'Choose your personal password to continue.',
  ACCOUNT_EMAIL_TAKEN: 'This email is already used.',
  WALLET_INSUFFICIENT: 'Not enough tokens. Top up at the front desk.',
  BOOKING_SESSION_FULL: 'This class is full.',
  BOOKING_DUPLICATE: 'You already have a spot in this class.',
  WAITLIST_FULL: 'The waiting list is full.',
  SESSION_STARTED: 'This class has already started.',
  SESSION_CANCELLED: 'This class has been cancelled.',
  TICKET_CLOSED: 'This booking is no longer active.',
  TICKET_UNKNOWN: 'Unknown ticket. Check the code.',
  CHECKIN_TOO_EARLY: 'Too early to check in.',
  CHECKIN_TOO_LATE: 'Too late: the class is over.',
  CHECKIN_ALREADY: 'Already checked in.',
  CHECKIN_WAITLIST: 'This client is on the waiting list.',
  CHECKIN_NOT_YOUR_COURSE: 'This ticket is for another coach’s class.',
  CHECKIN_OTHER_GYM: 'This ticket belongs to another gym.',
  CHECKIN_WRONG_SESSION: 'This ticket is for another class.',
  RECHARGE_PRICE_CHANGED: 'The price changed since the quote. Show the new amount to the client.',
  RATING_NOT_ALLOWED: 'Only classes you attended can be rated.',
  RATING_TOO_EARLY: 'You can rate the class once it is over.',
  RATING_EXPIRED: 'The 30-day rating period is over.',
  RATING_DUPLICATE: 'You already rated this class.',
  COURSE_ROOM_CONFLICT: 'The studio is already taken at that time.',
  COURSE_COACH_CONFLICT: 'You already teach at that time.',
  COURSE_ALREADY_REVIEWED: 'This course has already been reviewed.',
  COURSE_DUPLICATE: 'This course has already been submitted.',
  IDEMPOTENCY_IN_PROGRESS: 'Already in progress…',
};

const AR: Messages = {
  NETWORK_ERROR: 'لا يوجد اتصال. تحقّق من الإنترنت وحاول مجددًا.',
  TIMEOUT: 'الخادم يستغرق وقتًا طويلًا. حاول بعد قليل.',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا. حاول بعد قليل.',
  INTERNAL: 'حدث خطأ. حاول مجددًا.',
  RATE_LIMITED: 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
  VALIDATION_ERROR: 'بعض المعلومات غير صحيحة.',
  NOT_FOUND: 'غير موجود.',
  FORBIDDEN_ROLE: 'دورك لا يسمح بهذا الإجراء.',
  FORBIDDEN_OTHER_GYM: 'هذا يخص قاعة أخرى.',
  AUTH_INVALID: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  AUTH_REQUIRED: 'سجّل الدخول للمتابعة.',
  AUTH_EXPIRED: 'انتهت الجلسة. سجّل الدخول من جديد.',
  AUTH_SESSION_EXPIRED: 'انتهت الجلسة. سجّل الدخول من جديد.',
  AUTH_SESSION_REVOKED: 'تم تسجيل خروجك. سجّل الدخول من جديد.',
  AUTH_REFRESH_REUSED: 'أُغلقت الجلسة لدواعٍ أمنية. سجّل الدخول من جديد.',
  AUTH_ACCOUNT_DISABLED: 'هذا الحساب معطّل. تواصل مع استقبال القاعة.',
  AUTH_GYM_DISABLED: 'هذه القاعة مغلقة حاليًا.',
  PASSWORD_CHANGE_REQUIRED: 'اختر كلمة مرورك الشخصية للمتابعة.',
  ACCOUNT_EMAIL_TAKEN: 'هذا البريد مستخدم بالفعل.',
  WALLET_INSUFFICIENT: 'رصيد غير كافٍ. اشحن في الاستقبال.',
  BOOKING_SESSION_FULL: 'هذه الحصة مكتملة.',
  BOOKING_DUPLICATE: 'لديك مكان في هذه الحصة بالفعل.',
  WAITLIST_FULL: 'قائمة الانتظار مكتملة.',
  SESSION_STARTED: 'بدأت هذه الحصة بالفعل.',
  SESSION_CANCELLED: 'أُلغيت هذه الحصة.',
  TICKET_CLOSED: 'هذا الحجز لم يعد نشطًا.',
  TICKET_UNKNOWN: 'تذكرة غير معروفة. تحقّق من الرمز.',
  CHECKIN_TOO_EARLY: 'الوقت مبكر لتسجيل الحضور.',
  CHECKIN_TOO_LATE: 'فات الأوان: انتهت الحصة.',
  CHECKIN_ALREADY: 'تم تسجيل الحضور مسبقًا.',
  CHECKIN_WAITLIST: 'هذا العميل في قائمة الانتظار.',
  CHECKIN_NOT_YOUR_COURSE: 'هذه التذكرة لحصة مدرب آخر.',
  CHECKIN_OTHER_GYM: 'هذه التذكرة تخص قاعة أخرى.',
  CHECKIN_WRONG_SESSION: 'هذه التذكرة لحصة أخرى.',
  RECHARGE_PRICE_CHANGED: 'تغيّر السعر منذ العرض. اعرض المبلغ الجديد على العميل.',
  RATING_NOT_ALLOWED: 'يمكن تقييم الحصص التي حضرتها فقط.',
  RATING_TOO_EARLY: 'يمكنك التقييم بعد انتهاء الحصة.',
  RATING_EXPIRED: 'انتهت مهلة التقييم (30 يومًا).',
  RATING_DUPLICATE: 'قيّمت هذه الحصة بالفعل.',
  COURSE_ROOM_CONFLICT: 'الاستوديو محجوز في هذا الوقت.',
  COURSE_COACH_CONFLICT: 'لديك حصة في هذا الوقت.',
  COURSE_ALREADY_REVIEWED: 'تمت مراجعة هذا الدرس بالفعل.',
  COURSE_DUPLICATE: 'تم إرسال هذا الدرس بالفعل.',
  IDEMPOTENCY_IN_PROGRESS: 'جارٍ التنفيذ…',
};

const FR_FALLBACK: Messages = {
  NETWORK_ERROR: 'Pas de connexion. Vérifiez internet et réessayez.',
  TIMEOUT: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
  INTERNAL: 'Une erreur est survenue. Réessayez.',
};

/** Message à afficher : français de l'API, sinon traduction du code, sinon message générique. */
export function problemMessage(e: unknown, lang: ApiLang = 'fr'): string {
  const p = e instanceof ApiProblem ? e : new ApiProblem(0, 'INTERNAL', '');
  if (lang === 'fr') return FR_FALLBACK[p.code] ?? (p.detail || FR_FALLBACK.INTERNAL!);
  const table = lang === 'en' ? EN : AR;
  return table[p.code] ?? table[p.status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR'] ?? table.INTERNAL!;
}

/** Premier message d'erreur d'un champ de formulaire (validation 422), ou `undefined`. */
export const fieldError = (e: unknown, field: string) => (e instanceof ApiProblem ? e.fieldErrors[field]?.[0] : undefined);
