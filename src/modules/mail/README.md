# Mail module

Sends transactional emails (SMTP via ZeptoMail). Built to be generic — adding a new
notification type means adding a template + one method, not touching the transport layer.

## Structure

```
mail/
├── mail.module.ts                          # Nest module, exports MailService
├── mail.service.ts                         # nodemailer transport + one public method per email type
└── templates/
    ├── base-email.template.ts              # shared HTML layout (header/footer), ro/en footer text
    └── car-share-invitation.template.ts    # subject + body for the "car shared with you" email
```

- `MailService.sendMail()` (private) is the only place that talks to nodemailer. It swallows
  and logs errors instead of throwing — a failed email must never break the calling feature
  (e.g. a car invite is still created even if the email fails to send).
- Each public method on `MailService` (e.g. `sendCarShareInvitation`) is a thin wrapper:
  build `{ subject, html }` from a template, then call `sendMail()`.
- Templates are plain functions returning `{ subject, html }`, not a templating engine —
  no new dependency needed for the current scale.

## Current usage

`CarAccessService.inviteUser()` (`../car-access/car-access.service.ts`) calls
`mailService.sendCarShareInvitation()` right after creating the `CarUserAccess` row, so the
invited user gets an email informing them a car was shared with them.

Language is picked from the invited user's `UserSettings.language` (`'en'` or default `'ro'`).

## How to add a new notification type (e.g. access-expiring email)

1. **Template** — add `templates/access-expiring.template.ts`:
   ```ts
   import { MailLang, renderEmailLayout } from './base-email.template';

   export interface AccessExpiringData { carLabel: string; expiresAt: Date; appUrl: string; }

   export function accessExpiringEmail(lang: MailLang, data: AccessExpiringData) {
     // build subject/body per lang, wrap body with renderEmailLayout(lang, body)
     return { subject: '...', html: renderEmailLayout(lang, '...') };
   }
   ```
2. **Service method** — in `mail.service.ts`, add:
   ```ts
   async sendAccessExpiring(to: string, lang: MailLang, data: AccessExpiringData): Promise<void> {
     const { subject, html } = accessExpiringEmail(lang, data);
     await this.sendMail(to, subject, html);
   }
   ```
3. **Trigger it** from wherever the business logic lives (e.g. a cron job checking expiry
   dates) — inject `MailService` (the consuming module must import `MailModule`), fetch the
   target user's `settings.language`, and call `mailService.sendAccessExpiring(...)`.

No changes are needed to `mail.module.ts` or the transport setup for new email types.

## Config (env vars, dev: `history-auto-utility-be/.env.dev`)

| Var | Meaning |
|---|---|
| `SMTP_HOST` | `smtp.zeptomail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | literal string `emailapikey` (ZeptoMail convention, not a placeholder) |
| `SMTP_PASS` | ZeptoMail API key/token |
| `MAIL_FROM` | `HAU App <noreply@denhau.ro>` — sender shown to recipients |

These only exist in `.env.dev` so far. Per the project's environment rule, the same vars need
to be added to `.env.test` (before `./deploy-test.sh`) and `.env`/`.env.production` (only when
explicitly asked) before mail will work in those environments — they will currently fail with
a clear "missing config" error there since `MailService` uses `getOrThrow` for all of them.

## Notes / things to know

- Romanian and English are the only supported languages, matching the two locales already
  in the frontend (`assets/i18n/ro.json` / `en.json`). Add more languages by extending the
  `Record<MailLang, ...>` lookups in each template and the `MailLang` type in
  `base-email.template.ts`.
- Email sending is `await`ed but failures never throw — check backend logs (`MailService`
  logger context) if an email doesn't arrive instead of expecting an API error.
- `MailModule` is not global; any module that wants to send mail must `import: [MailModule]`
  (see `car-access.module.ts` for the pattern).
