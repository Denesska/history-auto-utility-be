import { MailLang, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

export type DocumentExpiryKind = 'RCA' | 'ITP' | 'ROVINIETA';

export interface DocumentExpiringData {
  carLabel: string;
  docType: DocumentExpiryKind;
  expiresAt: Date;
  daysLeft: number;
  appUrl: string;
}

const DOC_LABELS: Record<DocumentExpiryKind, Record<MailLang, string>> = {
  RCA: { ro: 'RCA', en: 'RCA insurance' },
  ITP: { ro: 'ITP', en: 'technical inspection (ITP)' },
  ROVINIETA: { ro: 'Rovinieta', en: 'road tax (rovinietă)' },
};

function formatDate(date: Date, lang: MailLang): string {
  return date.toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB');
}

export function documentExpiringEmail(lang: MailLang, data: DocumentExpiringData): RenderedEmail {
  const docLabel = DOC_LABELS[data.docType][lang];
  const expiresAtStr = formatDate(data.expiresAt, lang);

  if (lang === 'en') {
    return {
      subject: `${docLabel} for ${data.carLabel} expires in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p>The <strong>${docLabel}</strong> for <strong>${data.carLabel}</strong> expires on <strong>${expiresAtStr}</strong> (in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}).</p>
        <p>Log in to HAU App to update the expiry date once renewed.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: `${docLabel} pentru ${data.carLabel} expiră în ${data.daysLeft} zile`,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${docLabel}</strong> pentru <strong>${data.carLabel}</strong> expiră pe <strong>${expiresAtStr}</strong> (în ${data.daysLeft} zile).</p>
      <p>Autentifică-te în HAU App pentru a actualiza data de expirare după reînnoire.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
