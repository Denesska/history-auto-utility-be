import { MailLang, daysText, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

/** SOON/DUE/OVERDUE come from the service plan; EXPIRY is a record's user-entered reminder date. */
export type MaintenanceDueStage = 'SOON' | 'DUE' | 'OVERDUE' | 'EXPIRY';

export interface MaintenanceDueData {
  carLabel: string;
  /** ServiceCategory enum value. */
  category: string;
  stage: MaintenanceDueStage;
  /** SOON only: which threshold(s) triggered it. */
  soonBy?: 'date' | 'km' | 'both';
  nextDueDate?: Date | string | null;
  /** Signed km to the threshold; null/undefined when unknown. */
  kmRemaining?: number | null;
  /** Calendar days to nextDueDate (negative = already past); EXPIRY: days to the record's reminder date. */
  daysLeft?: number | null;
  /** OVERDUE: days since it became due. */
  overdueDays?: number;
  /** EXPIRY of an OTHER-category record: the record's description. */
  description?: string | null;
  appUrl?: string;
}

const CATEGORY_LABELS: Record<string, Record<MailLang, string>> = {
  OIL_CHANGE: { ro: 'Schimbul de ulei', en: 'Oil change' },
  BRAKE_SERVICE: { ro: 'Revizia frânelor', en: 'Brake service' },
  TRANSMISSION_SERVICE: { ro: 'Revizia transmisiei', en: 'Transmission service' },
  TIRE_SERVICE: { ro: 'Service-ul anvelopelor', en: 'Tire service' },
  FLUID_SERVICE: { ro: 'Schimbul de lichide', en: 'Fluid service' },
  ENGINE_SERVICE: { ro: 'Revizia motorului', en: 'Engine service' },
  INSPECTION: { ro: 'Inspecția', en: 'Inspection' },
  BATTERY_SERVICE: { ro: 'Service-ul bateriei', en: 'Battery service' },
  FILTER_SERVICE: { ro: 'Schimbul de filtre', en: 'Filter service' },
  LIGHT_SERVICE: { ro: 'Service-ul farurilor', en: 'Light service' },
  COMBUSTIBIL: { ro: 'Alimentarea', en: 'Refuelling' },
  OTHER: { ro: 'Lucrarea de întreținere', en: 'Maintenance job' },
};

export function maintenanceCategoryLabel(category: string, lang: MailLang): string {
  return (CATEGORY_LABELS[category] ?? CATEGORY_LABELS.OTHER)[lang];
}

function roundKm(km: number): number {
  return Math.max(0, Math.round(km / 100) * 100);
}

function formatDate(date: Date | string, lang: MailLang): string {
  return new Date(date).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB');
}

function daysPhrase(days: number, lang: MailLang): string {
  if (days === 1 && lang === 'ro') return 'mâine';
  return `${lang === 'en' ? 'in' : 'în'} ${daysText(days, lang)}`;
}

/** "is due in 9 days / ~800 km" / "is due now" / "is overdue by 34 days" / "has a reminder date today", per language. */
function whenPhrase(data: MaintenanceDueData, lang: MailLang): string {
  const en = lang === 'en';
  if (data.stage === 'DUE') return en ? 'is due now' : 'a ajuns la scadență';
  if (data.stage === 'OVERDUE') {
    const d = data.overdueDays ?? 0;
    return en ? `is overdue by ${daysText(d, 'en')}` : `are o întârziere de ${daysText(d, 'ro')}`;
  }
  if (data.stage === 'EXPIRY') {
    const d = data.daysLeft ?? 0;
    if (d < 0) return en ? 'had its reminder date yesterday' : 'a avut data de reminder ieri';
    if (d === 0) return en ? 'has its reminder date today' : 'are data de reminder astăzi';
    return en ? `has its reminder date ${daysPhrase(d, lang)}` : `are data de reminder ${daysPhrase(d, lang)}`;
  }
  // SOON
  const parts: string[] = [];
  if (data.soonBy !== 'km' && data.daysLeft != null) {
    parts.push(data.daysLeft <= 0 ? (en ? 'today' : 'astăzi') : daysPhrase(data.daysLeft, lang));
  }
  if (data.soonBy !== 'date' && data.kmRemaining != null) parts.push(`~${roundKm(data.kmRemaining)} km`);
  const kmOnly = data.soonBy === 'km';
  const when = parts.join(' / ');
  if (en) return `is due ${kmOnly ? 'in ' : ''}${when}`;
  return `ajunge la scadență ${kmOnly ? 'în ' : ''}${when}`;
}

/** The thing the reminder is about: the category name, or the record's own description for an OTHER record date. */
function subject(data: MaintenanceDueData, lang: MailLang): string {
  return data.stage === 'EXPIRY' && data.category === 'OTHER' && data.description
    ? data.description
    : maintenanceCategoryLabel(data.category, lang);
}

function sentence(data: MaintenanceDueData, lang: MailLang): string {
  return `${subject(data, lang)} ${lang === 'ro' ? 'pentru' : 'for'} ${data.carLabel} ${whenPhrase(data, lang)}`;
}

/** Short one-line text for push notifications. */
export function maintenanceDuePushText(lang: MailLang, data: MaintenanceDueData): { title: string; body: string } {
  const ro = lang === 'ro';
  const title =
    data.stage === 'EXPIRY'
      ? ro ? 'Reminder întreținere' : 'Maintenance reminder'
      : data.stage === 'SOON'
        ? ro ? 'Revizie în curând' : 'Maintenance due soon'
        : data.stage === 'DUE'
          ? ro ? 'Revizie scadentă' : 'Maintenance due'
          : ro ? 'Revizie întârziată' : 'Maintenance overdue';
  return { title, body: sentence(data, lang) };
}

export function maintenanceDueEmail(lang: MailLang, data: MaintenanceDueData & { appUrl: string }): RenderedEmail {
  const line = sentence(data, lang);
  const dateStr = data.nextDueDate ? formatDate(data.nextDueDate, lang) : null;

  if (lang === 'en') {
    return {
      subject: line,
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p><strong>${subject(data, 'en')}</strong> for <strong>${data.carLabel}</strong> ${whenPhrase(data, 'en')}${dateStr && data.stage !== 'EXPIRY' ? ` (due date: <strong>${dateStr}</strong>)` : ''}.</p>
        <p>Log in to HAU App to see the maintenance plan, and log the service once it's done to start a new cycle.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: line,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${subject(data, 'ro')}</strong> pentru <strong>${data.carLabel}</strong> ${whenPhrase(data, 'ro')}${dateStr && data.stage !== 'EXPIRY' ? ` (data scadenței: <strong>${dateStr}</strong>)` : ''}.</p>
      <p>Autentifică-te în HAU App pentru a vedea planul de întreținere și înregistrează lucrarea după ce e făcută, ca să înceapă un nou ciclu.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
