# Document expiry reminders

## Functionality

HAU App warns you before a car document runs out. Every morning (08:00) it checks the active cars you own or have been given access to, and for each type of document that has an expiry date (RCA, ITP, rovinieta, CASCO, ...) it looks at the one that expires last. If you renewed a document and added the new one, the old one is ignored.

You are reminded:
- **before expiry**, on the days you chose in Settings (default: 7, 3, 1 and 0 days before; "0" means on the day it expires);
- **once after expiry**, the day after the document expired ("expired yesterday"), whenever reminders are on.

Each reminder arrives three ways: an email, an entry in the in-app notifications list (with the unread badge; tapping it opens the car), and always a push notification on your phone/browser, even if the app is open on another device. Texts are in your app language (Romanian or English) and name the car (your own label for it, plus the plate), the document, the expiry date and how many days are left.

Reminders can be switched off entirely in Settings. Each reminder is sent only once per person and document; if the email could not be delivered it is retried (email only) over the next three days. If the app was down on a reminder day, that day is not made up later. Cars of a business whose Documents feature is switched off are skipped.

## Implementation

- Service: `history-auto-utility-be/src/modules/document-reminders/document-reminders.service.ts`. `@Cron('0 8 * * *')` calls `run()`; `run({ dryRun?, today? })` is the testable core and returns a `RunSummary` (counts + candidate list). Logs one line at start and one at end (cars scanned, docs considered, in-app/push/email sent, email failures, failures).
- Source of truth is the `Document` table (`is_active`, non-null `expiry_date`), NOT the legacy `Car.*_expiry_date` columns. Per car, one doc per type: latest `expiry_date` wins. Vignettes are keyed per country (`ROV` = home/RO, `ROV:DE` = foreign) so a foreign vignette never hides the home one. `ROVINIETA` is treated as an alias of `ROV`.
- Offsets: user's `UserSettings.expiry_reminder_days` (schema default `[7,3,1,0]`; the settings UI offers 0/1/3/7/14/30) plus a fixed `-1` (expired) offset, always sent when `expiry_reminders_enabled`. Anything older than -1 is never sent.
- Recipients: car owner + users with accepted `CarUserAccess`. Each recipient gets their own `CarUserNickname` label (fallback make+model) plus plate. Orgs with the `documents` feature off are skipped (`FeatureAccessService.disabledOrgIds`).
- Channels and ordering: `NotificationsService.create(user, 'DOCUMENT_EXPIRING', data)` (DB row + WebSocket if connected, plus FCM push via `PushService` always: the job passes `{ forcePush: true }`, which also makes push errors non-fatal — logged and swallowed — so the dedup row and email still follow) -> insert `DocumentReminderSent` row (`email_sent=false`) -> `MailService.sendDocumentExpiring` (now returns `boolean`; `sendMail` still swallows errors) -> set `email_sent=true`. The row is written only after the notification went out, so push/in-app is never repeated; `retryFailedEmails` re-sends only the email for rows with `email_sent=false` created in the last 3 days. If `create` throws before the notification row is saved, no row is written and nothing is retried until the next matching offset. No per-channel user preferences exist in the codebase, so none are applied.
- Dedup key (unique): `(user_id, car_id, doc_type, expiry_date, days_before)`; `doc_type` is a free string (was the `DocumentExpiryType` enum, now unused in the schema).
- Text: email in `mail/templates/document-expiring.template.ts`; push text via `documentExpiringPushText` (used by `notifications/push.service.ts`, language read from the notification's `data.lang`). In-app text is rendered by the frontend (`sidebar.notifications.documentExpiring.*` / `docTypes.*` in en/ro, `notifications-panel.component.html`); tapping navigates to the car details page. Notification `data`: `carId, carLabel, docType (normalized: RCA|ITP|ROV|CASCO|OTHER), docTypeRaw, expiresAt, daysLeft, lang`.
- Dry run: `POST /admin/document-reminders/dry-run` (admin only, `@Scope('personal')` via the controller, body `{ today?: ISO date }`) or `ENV_FILE=.env.dev npx ts-node -T scripts/document-reminders-dry-run.ts [YYYY-MM-DD]` (refuses to run against a non-dev DB). Neither sends nor writes anything.
- Known gaps: no catch-up for missed days; business/org cars notify the owning user and users with accepted car access (org members' access is not specially handled).
