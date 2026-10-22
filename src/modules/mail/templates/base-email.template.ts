export type MailLang = 'ro' | 'en' | 'ru';

/** Maps a stored user language to a supported mail language: ru and ro are kept, anything else falls back to en. */
export function resolveMailLang(language?: string | null): MailLang {
  return language === 'ru' ? 'ru' : language === 'ro' ? 'ro' : 'en';
}

/** "1 day" / "5 days" / "1 zi" / "5 zile" / "20 de zile" (Romanian: 2-19 take "zile", 0 and 20+ take "de zile"). */
export function daysText(n: number, lang: MailLang): string {
  if (lang === 'en') return n === 1 ? '1 day' : `${n} days`;
  if (lang === 'ru') {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} день`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} дня`;
    return `${n} дней`;
  }
  const r = n % 100;
  return n === 1 ? '1 zi' : r >= 1 && r <= 19 ? `${n} zile` : `${n} de zile`;
}

const DATE_LOCALES: Record<string, string> = { en: 'en-GB', ro: 'ro-RO', ru: 'ru-RU' };

/** Long-month date ("5 March 2026" / "5 martie 2026") in the recipient's language; unknown codes go straight to Intl, falling back to en-GB. */
export function formatDate(date: Date | string, lang: string): string {
  const d = new Date(date);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  try {
    return d.toLocaleDateString(DATE_LOCALES[lang] ?? lang, opts);
  } catch {
    return d.toLocaleDateString('en-GB', opts);
  }
}

const SNOOZE_HINT: Record<MailLang, string> = {
  ro: 'Nu mai ai nevoie de acest memento? Îl poți amâna sau poți opri mementourile pentru această mașină din panoul de notificări din aplicație.',
  ru: 'Это напоминание больше не нужно? Вы можете отложить его или отключить напоминания для этого автомобиля в панели уведомлений в приложении.',
  en: "Don't need this reminder? You can snooze it or mute reminders for this car from the notifications panel in the app.",
};

/** Secondary line pointing to in-app snooze/mute (emails deliberately carry no snooze link). */
export function snoozeHintHtml(lang: MailLang): string {
  return `<p style="margin-top:24px;color:#9ca3af;font-size:12px;">${SNOOZE_HINT[lang]}</p>`;
}

const FOOTER_TEXT: Record<MailLang, string> = {
  ro: 'Acest email a fost trimis automat de HAU App.',
  ru: 'Это письмо отправлено автоматически приложением HAU App.',
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
