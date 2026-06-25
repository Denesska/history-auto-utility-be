import { MailLang, renderEmailLayout } from './base-email.template';

export interface CarShareInvitationData {
  inviterName: string;
  carLabel: string;
  role: string;
  appUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const ROLE_LABELS: Record<string, Record<MailLang, string>> = {
  OWNER: { ro: 'Proprietar', en: 'Owner' },
  FULL: { ro: 'acces complet', en: 'full access' },
  USER: { ro: 'acces utilizator', en: 'user access' },
  MAINTENANCE: { ro: 'acces mentenanță', en: 'maintenance access' },
  VIEWER: { ro: 'acces de vizualizare', en: 'view access' },
};

export function carShareInvitationEmail(lang: MailLang, data: CarShareInvitationData): RenderedEmail {
  const roleLabel = ROLE_LABELS[data.role]?.[lang] ?? data.role;

  if (lang === 'en') {
    return {
      subject: `${data.inviterName} shared a car with you on HAU App`,
      html: renderEmailLayout(
        'en',
        `
        <p>Hi,</p>
        <p><strong>${data.inviterName}</strong> shared <strong>${data.carLabel}</strong> with you on HAU App, with ${roleLabel}.</p>
        <p>Log in to your account to view and accept the invitation.</p>
        <p style="margin-top:24px;">
          <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Open HAU App</a>
        </p>
        `,
      ),
    };
  }

  return {
    subject: `${data.inviterName} ți-a partajat o mașină pe HAU App`,
    html: renderEmailLayout(
      'ro',
      `
      <p>Salut,</p>
      <p><strong>${data.inviterName}</strong> ți-a partajat mașina <strong>${data.carLabel}</strong> pe HAU App, cu ${roleLabel}.</p>
      <p>Autentifică-te în contul tău pentru a vedea și accepta invitația.</p>
      <p style="margin-top:24px;">
        <a href="${data.appUrl}" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Deschide HAU App</a>
      </p>
      `,
    ),
  };
}
