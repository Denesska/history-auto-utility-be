export type MailLang = 'ro' | 'en';

const FOOTER_TEXT: Record<MailLang, string> = {
  ro: 'Acest email a fost trimis automat de HAU App.',
  en: 'This email was sent automatically by HAU App.',
};

export function renderEmailLayout(lang: MailLang, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#1f2937;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">HAU App</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.5;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
                ${FOOTER_TEXT[lang]}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
