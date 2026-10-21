# AI usage guard

## Functionality

Some features of the app use artificial intelligence to read documents and
photos or to make suggestions. Those features cost money for every request, so
during the pilot the app keeps an eye on how much AI is used, by whom, and
stops abuse before it gets expensive. Normal use is never affected: the limits
are set generously and are meant to catch runaway or automated use, not
people who scan a few documents a week.

### Which features are covered

- **Automatic document and photo scanning** — reading a document (insurance,
  inspection, road tax, registration, and so on) when you add it, reading the
  registration certificate when you add a car, and reading the odometer from a
  photo.
- **ID-card and vehicle scanning** in the sale-contract wizard (the buyer's and
  seller's ID cards, and the registration certificate).
- **Automatic maintenance category suggestion**, which suggests a service
  category from what you type.
- **Car silhouette drawings**, the generic schematic drawings of a car model
  used when there is no photo.

Scanning a document that the app can read without AI (a standard digital PDF
in a known layout) is free and never counts toward any limit.

### Limits

- **Per minute:** by default at most 10 AI requests per minute per person.
- **Per day and per month:** each person has a daily and a monthly AI budget,
  measured as the estimated cost the provider charges for their requests. By
  default this is $0.50 per day and $5 per month.
- **Global daily safety cap:** a cap for the whole app, by default $10 per day.
  When it is reached, AI features pause for everyone until the next day.
- Days and months are counted in Romanian time (Europe/Bucharest), so a new day
  starts at midnight in Bucharest.
- Administrators can change every one of these limits, change the per-person
  budgets for individual users, block AI for an individual user, or switch the
  limits off entirely.

### Warnings

- When a person's usage after a successful scan gets close to their daily or
  monthly budget (by default 80% of it), they see a gentle one-time warning
  message. It is only a heads-up; scanning keeps working.

### What happens when a limit is reached

- Scanning pauses and the app shows a polite message explaining that AI scanning
  is limited for fair use, and when it will be available again: in about a
  minute, tomorrow, or at the start of next month, depending on which limit was
  reached.
- The form always stays usable. Every field can still be filled in by hand.
- Category suggestion simply gives no suggestion; nothing is filled in and no
  message is shown.
- Car silhouettes are simply not drawn for now.

### Re-scanning the same document

- If you scan exactly the same document file again within 7 days, the app
  returns the earlier result immediately, costs nothing, and does not count
  toward any limit. This does not apply to ID-card scans, which are never kept
  for re-use, for privacy reasons.

### Notifications for administrators

- Administrators receive a notification the first time each day that someone
  hits their daily or monthly limit, or is blocked, and another when the global
  daily cap is reached. Tapping it opens the AI usage section of the admin page.

### Admin view: AI usage

The admin page has an **AI usage** section that shows:

- Totals for the chosen period (7, 30 or 90 days): estimated cost, number of
  AI calls, tokens used, number of different users, blocked attempts and free
  results served from the re-scan cache.
- Today's spend against the global daily cap.
- Cost per day, and what consumed the most, broken down by feature and by model.
- The top 20 users by spend, with today's and this month's spend, and a marker
  where a person has a custom limit or a block.
- The most recent blocked attempts.
- **Settings:** whether limits are on, calls per minute, the default daily and
  monthly budgets, the global daily cap and the warning threshold.
- **Per-user overrides:** set a custom daily and monthly budget for one person,
  block AI for that person, add a note explaining why, or reset that person to
  the defaults.

The figures are estimates based on the provider's published prices and on the
tokens reported for each request. They are good for spotting trends and
abuse, not for exact billing.

## Implementation

**Backend module:** `history-auto-utility-be/src/modules/ai-usage/`. Everything
else in this document refers to it.

- `ai-usage.service.ts` — the `@Global()` `AiUsageService`, injected anywhere
  AI is called. Methods: `checkQuota` (decision only), `assertQuota` (throws the
  429 used by callers that must stop), `record` (writes one usage row), `run`
  (wraps a provider call: check, call, record), `getCached` / `setCached` (the
  re-scan cache) and `getMyUsage` (the figures behind `GET /ai-usage/me`).
  Calls with no user (background jobs) only check the global cap.
- `ai-pricing.ts` — per-model USD price table used to estimate cost from
  tokens. Claude Haiku 4.5 is $1 / $5 per million input / output tokens. The
  **Gemini and Cloudflare prices are placeholders marked VERIFY** and must be
  checked against the providers' current price lists before the dollar figures
  are trusted.
- `ai-time.ts` — Europe/Bucharest day and month boundaries.
- `ai-features.ts` — the feature keys (`document_extract`, `identity_extract`,
  `maintenance_category`, `vehicle_silhouette`), provider names and usage
  statuses (`ok`, `error`, `cached`, `blocked`) used in usage rows and admin
  breakdowns.
- `ai-usage.controller.ts` — `GET /ai-usage/me` (`@Scope('any')`), the figures
  for the signed-in person.
- `ai-usage.module.ts` — the module.

**Check order (in `checkQuota`):** limits disabled → user blocked → global daily
cap → burst (rows in the last 60 seconds) → daily → monthly. The first failing
check wins and is the `reason` returned. A rejected request answers HTTP 429
with body `{ code: 'AI_QUOTA_EXCEEDED', reason: 'burst' | 'daily' | 'monthly' |
'blocked' | 'global', retryAt }`.

**Data (Prisma):**

- `AiUsage` — one row per real provider call, plus a `blocked` row for each
  rejected attempt and a `cached` row for each free cache hit. Cost is estimated
  from the tokens reported by the provider.
- `AiUserLimit` — per-user override (custom daily/monthly budget, block flag,
  note).
- `AiSettings` — single row, `id = 1`: global switch, calls per minute, default
  budgets, global daily cap, warning threshold.
- `AiResultCache` — per user + feature + SHA-256 of the file, 7-day TTL. Used
  only by `document_extract`. ID-card scans never write to it.
- `NotificationType.AI_QUOTA_BLOCKED` — the admin notification type. Push text
  lives in `notifications/push.service.ts`.

**Call sites:**

- Document extraction — `document/document-extraction.service.ts`. The free
  pdf-parse / RCA path is never counted. A cache hit skips the quota check.
  Gemini and the Cloudflare fallback are each recorded separately.
- Identity extraction — `sale-contract/extraction/identity-extraction.service.ts`.
  Providers report their usage through the shared reporter in
  `src/common/ai/ai-call-report.ts`.
- Category suggestion — `maintenance-record`'s `category-suggestion.service.ts`.
  Uses `onLimit` skip: a blocked request returns a `null` suggestion, not an
  error.
- Vehicle silhouette — uses `onLimit` skip too. A skipped run does not consume
  one of its 3 attempts. The older in-memory limiter (20 per hour) is still in
  place alongside it.

**Output token caps:** Gemini calls now set `maxOutputTokens` — 8192 for
extraction, 1024 for category suggestion, 16384 for silhouettes. These are
deliberately generous because thinking tokens may count toward the output.
Cloudflare calls record 0 tokens when the response carries no usage object, so
their cost can be understated.

**Admin side:** endpoints in `modules/admin/` — `admin-ai-usage.service.ts` and
`dto/admin-ai.dto.ts`:

- `GET /admin/ai-usage?days=` — the admin figures.
- `GET /admin/ai-settings`, `PUT /admin/ai-settings` — global settings.
- `GET /admin/ai-users/:userId/limit`, `PUT /admin/ai-users/:userId/limit`,
  `DELETE /admin/ai-users/:userId/limit` — per-user overrides.

Frontend admin UI: `history-auto-utility-fe/src/app/features/admin/ai-usage/`
(see that feature's FEATURE.md).

**Frontend consumers:** `history-auto-utility-fe/src/app/core/ai-quota.service.ts`
(`isQuotaError`, `messageFor`, `toastIfQuotaError`, `checkWarning`) is used by
the document form, the car form (registration scan), the sale-contract wizard
and `core/odometer-scan.service.ts`. The odometer service treats a quota error
as final and skips its retry backoff. Transloco keys live under `aiQuota.*`.

**Decisions:**

- Limits are per person, across personal and business contexts. A person's
  usage in one context counts against their budget in the other.
- Blocked and cached attempts are recorded as rows so the admin view can show
  them. They carry zero cost; only successful and failed provider calls are
  costed.
- ID-card scans are excluded from the re-scan cache for privacy.

**Known gaps:**

- Placeholder prices for Gemini and Cloudflare must be verified before the
  dollar amounts are trusted.
- Cloudflare token usage may read as 0 when the provider omits it, which
  understates its cost.
- The global cap and per-user budgets are estimates from tokens and published
  prices, not billed amounts.
