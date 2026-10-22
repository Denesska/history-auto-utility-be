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

const TEXTS: Record<MailLang, { subject: string; greeting: string; intro: string; company: string; message: string; cta: string }> = {
  en: {
    subject: 'Business account request',
    greeting: 'Hello,',
    intro: 'asked to be able to create a company on HAU App.',
    company: 'Company',
    message: 'Message',
    cta: 'Review request',
  },
  ro: {
    subject: 'Cerere cont business',
    greeting: 'Salut,',
    intro: 'a cerut să poată crea o companie pe HAU App.',
    company: 'Companie',
    message: 'Mesaj',
    cta: 'Revizuiește cererea',
  },
  ru: {
    subject: 'Запрос бизнес-аккаунта',
    greeting: 'Здравствуйте,',
    intro: 'запросил возможность создать компанию в HAU App.',
    company: 'Компания',
    message: 'Сообщение',
    cta: 'Рассмотреть запрос',
  },
};

/** Admin alert: someone asked to be allowed to create an organization. Sent in the recipient's language. */
export function businessAccessRequestedEmail(lang: MailLang, data: BusinessAccessRequestedData): RenderedEmail {
  const t = TEXTS[lang];
  return {
    subject: `${t.subject}: ${data.companyName}`,
    html: renderEmailLayout(
      lang,
      `
      <p>${t.greeting}</p>
      <p><strong>${data.requesterName}</strong> (${data.requesterEmail}) ${t.intro}</p>
      <p><strong>${t.company}:</strong> ${data.companyName}</p>
      ${data.note ? `<p><strong>${t.message}:</strong> ${data.note}</p>` : ''}
      <p style="margin-top:24px;">
        <a href="${data.appUrl}/main/admin" style="background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">${t.cta}</a>
      </p>
      `,
    ),
  };
}
