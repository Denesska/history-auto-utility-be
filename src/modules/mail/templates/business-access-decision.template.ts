import { MailLang, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

export interface BusinessAccessApprovedData {
  companyName: string;
  appUrl: string;
}

export interface BusinessAccessRejectedData {
  companyName: string;
  reason: string | null;
  appUrl: string;
}

export function businessAccessApprovedEmail(lang: MailLang, data: BusinessAccessApprovedData): RenderedEmail {
  if (lang === 'en') {
    return {
      subject: 'Your business account request was approved',
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p>Your request to create <strong>${data.companyName}</strong> on HAU App was approved.</p>
        <p>You can now sign in to the Business tab and create your company.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: 'Cererea ta de cont business a fost aprobată',
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p>Cererea ta de a crea <strong>${data.companyName}</strong> pe HAU App a fost aprobată.</p>
      <p>Te poți autentifica acum din tab-ul Business și îți poți crea compania.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}

export function businessAccessRejectedEmail(lang: MailLang, data: BusinessAccessRejectedData): RenderedEmail {
  if (lang === 'en') {
    return {
      subject: 'Your business account request was not approved',
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p>Your request to create <strong>${data.companyName}</strong> on HAU App was not approved.</p>
        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
        <p>You can submit a new request at any time.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: 'Cererea ta de cont business nu a fost aprobată',
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p>Cererea ta de a crea <strong>${data.companyName}</strong> pe HAU App nu a fost aprobată.</p>
      ${data.reason ? `<p><strong>Motiv:</strong> ${data.reason}</p>` : ''}
      <p>Poți trimite oricând o cerere nouă.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
