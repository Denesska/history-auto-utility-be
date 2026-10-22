import { MailLang, daysText, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

/** Document.document_type as stored ('RCA', 'ITP', 'ROV', 'CASCO', ...); ROVINIETA is accepted as an alias of ROV. */
export type DocumentExpiryKind = string;

export interface DocumentExpiringData {
  carLabel: string;
  docType: DocumentExpiryKind;
  expiresAt: Date;
  /** Days until expiry; 0 = today, negative = already expired. */
  daysLeft: number;
  appUrl: string;
}

const DOC_LABELS: Record<string, Record<MailLang, string>> = {
  RCA: { ro: 'RCA', en: 'RCA insurance' },
  ITP: { ro: 'ITP', en: 'technical inspection (ITP)' },
  ROV: { ro: 'Rovinieta', en: 'road tax (rovinietă)' },
  CASCO: { ro: 'CASCO', en: 'CASCO insurance' },
};

/** Keys the frontend has labels for (sidebar.notifications.docTypes.*); anything else is sent as 'OTHER'. */
export function normalizeDocKind(docType: string): string {
  const base = docType === 'ROVINIETA' ? 'ROV' : docType;
  return base in DOC_LABELS ? base : 'OTHER';
}

export function docLabel(docType: string, lang: MailLang): string {
  const kind = normalizeDocKind(docType);
  return kind === 'OTHER' ? (lang === 'ro' ? 'Documentul' : 'document') : DOC_LABELS[kind][lang];
}

function formatDate(date: Date, lang: MailLang): string {
  return date.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB');
}

/** "expires in 3 days" / "expires today" / "expired yesterday" phrase, per language. */
function whenPhrase(daysLeft: number, lang: MailLang): string {
  if (lang === 'en') {
    if (daysLeft < 0) return daysLeft === -1 ? 'expired yesterday' : `expired ${daysText(-daysLeft, 'en')} ago`;
    if (daysLeft === 0) return 'expires today';
    return `expires in ${daysText(daysLeft, 'en')}`;
  }
  if (daysLeft < 0) return daysLeft === -1 ? 'a expirat ieri' : `a expirat acum ${daysText(-daysLeft, 'ro')}`;
  if (daysLeft === 0) return 'expiră astăzi';
  return daysLeft === 1 ? 'expiră mâine' : `expiră în ${daysText(daysLeft, 'ro')}`;
}

/** Short one-line text for push notifications. */
export function documentExpiringPushText(
  lang: MailLang,
  data: { carLabel: string; docType: string; daysLeft: number },
): { title: string; body: string } {
  const label = docLabel(data.docType, lang);
  return {
    title: data.daysLeft < 0 ? (lang === 'ro' ? 'Document expirat' : 'Document expired') : lang === 'ro' ? 'Document expiră' : 'Document expiring',
    body: `${label} ${lang === 'ro' ? 'pentru' : 'for'} ${data.carLabel} ${whenPhrase(data.daysLeft, lang)}`,
  };
}

export function documentExpiringEmail(lang: MailLang, data: DocumentExpiringData): RenderedEmail {
  const label = docLabel(data.docType, lang);
  const expiresAtStr = formatDate(data.expiresAt, lang);
  const when = whenPhrase(data.daysLeft, lang);

  if (lang === 'en') {
    return {
      subject: `${label} for ${data.carLabel} ${when}`,
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p>The <strong>${label}</strong> for <strong>${data.carLabel}</strong> ${when} (expiry date: <strong>${expiresAtStr}</strong>).</p>
        <p>Log in to HAU App to update the expiry date once renewed.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: `${label} pentru ${data.carLabel} ${when}`,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${label}</strong> pentru <strong>${data.carLabel}</strong> ${when} (data expirării: <strong>${expiresAtStr}</strong>).</p>
      <p>Autentifică-te în HAU App pentru a actualiza data de expirare după reînnoire.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
