import { MailLang, renderEmailLayout } from './base-email.template';
import { RenderedEmail } from './car-share-invitation.template';

export interface OrganizationInvitationData {
  inviterName: string;
  organizationName: string;
  role: string;
  appUrl: string;
}

const ROLE_LABELS: Record<string, Record<MailLang, string>> = {
  SUPER_ADMIN: { ro: 'Director', en: 'Director' },
  FLEET_ADMIN: { ro: 'Fleet admin', en: 'Fleet admin' },
  MANAGER: { ro: 'Manager', en: 'Manager' },
  DRIVER: { ro: 'Șofer', en: 'Driver' },
  FINANCE: { ro: 'Finance', en: 'Finance' },
};

/** The invited email already has a HAU App account — this is a notification + instructions to accept. */
export function organizationInvitationExistingUserEmail(lang: MailLang, data: OrganizationInvitationData): RenderedEmail {
  const roleLabel = ROLE_LABELS[data.role]?.[lang] ?? data.role;

  if (lang === 'en') {
    return {
      subject: `${data.inviterName} invited you to ${data.organizationName} on HAU App`,
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p><strong>${data.inviterName}</strong> invited you to join <strong>${data.organizationName}</strong> on HAU App, as <strong>${roleLabel}</strong>.</p>
        <p>Log in to your account to view and accept the invitation.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: `${data.inviterName} te-a invitat la ${data.organizationName} pe HAU App`,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${data.inviterName}</strong> te-a invitat în <strong>${data.organizationName}</strong> pe HAU App, cu rolul de <strong>${roleLabel}</strong>.</p>
      <p>Autentifică-te în contul tău pentru a vedea și accepta invitația.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
