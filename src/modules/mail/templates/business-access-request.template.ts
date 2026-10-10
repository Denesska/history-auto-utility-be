import { MailLang, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

export interface BusinessAccessRequestedData {
  requesterName: string;
  requesterEmail: string;
  companyName: string;
  note: string | null;
  /** Links straight to the admin page's review screen. */
  appUrl: string;
}

/** Admin alert: someone asked to be allowed to create an organization. Always sent in Romanian — recipients are the app's own admins. */
export function businessAccessRequestedEmail(_lang: MailLang, data: BusinessAccessRequestedData): RenderedEmail {
  return {
    subject: `Cerere cont business: ${data.companyName}`,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${data.requesterName}</strong> (${data.requesterEmail}) a cerut să poată crea o companie pe HAU App.</p>
      <p><strong>Companie:</strong> ${data.companyName}</p>
      ${data.note ? `<p><strong>Mesaj:</strong> ${data.note}</p>` : ''}
      <p style="margin-top:24px;">
        <a href="${data.appUrl}/main/admin" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Revizuiește cererea</a>
      </p>
      `,
    ),
  };
}
