# Product Name Optimiser

Evidence-led PDP product titles for retail brands. Built from the Claude build brief.
First brand: Sportsgirl. Multi-brand from day one.

**Status:** Phases 1-3 done (foundation, logins, keyword datasets, retrieval + scoring, recommendation pipeline). Buyer UI is Phase 4.

## Stack
Next.js 15 (TypeScript) · Prisma + PostgreSQL (`pg_trgm`, full-text) · Zod · jose + bcrypt · Vitest · Render.

## Local setup
```bash
cp .env.example .env        # set DATABASE_URL, AUTH_SECRET (32+ chars); PROVIDER_MODE=mock for no paid APIs
npm ci
npx prisma migrate deploy
npm run db:seed             # creates the sportsgirl brand
npm run user:create -- --username me --role owner --name "Me"
npm run dev
```

## Client logins
Accounts are created by you only. There is no sign-up, no "forgot password", no self-service.

| Role | Can do |
| --- | --- |
| `owner` (you) | Everything, all brands, create/reset/disable users |
| `admin` | Brand-level: datasets, brand settings, history (Phases 2+) |
| `buyer` | Generate names, feedback, own history |

```bash
npm run user:create  -- --username sg-buyer1 --brand sportsgirl --name "SG Buyer"   # prints a generated password once
npm run user:reset   -- --username sg-buyer1                                         # new password, signs them out everywhere
npm run user:disable -- --username sg-buyer1                                         # instant lockout
npm run user:list
```
Or use **Users** in the app when signed in as owner. Passwords are bcrypt-hashed; the plaintext is shown once and never stored.
Usernames are case-insensitive. 5 failed logins locks the account for 15 minutes. Disabling a user or brand takes effect on their next request.

## Keyword datasets
Admin > **Datasets** (or CLI). CSV or XLSX, up to 30MB. Flow: upload, check column mapping, validate + import as a **new inactive version**, then activate.
Uploads never overwrite the active dataset; a bad file leaves it untouched. Rolling back = activating an older version.

```bash
npm run dataset:import -- --brand sportsgirl --file ./keywords.xlsx --sheet "Generic Keywords" \
  --name "Generic Oct 2026" --ignore "Source(s)" --activate
```
- Required column: `keyword`. Everything else optional. Unknown columns are kept in `metadata`; mark a column `ignore` to drop it.
- **Several volume columns** (e.g. Ahrefs + Keyword Planner) are combined with a rule: `max` (default), `first_available`, or `sum`. Every raw value is kept on the keyword.
  The two sources aren't like-for-like (Keyword Planner runs ~2.4x Ahrefs where both exist), so check the rule suits your list.
- Blank volume = "volume unavailable", never 0. Duplicates (normalised keyword + country + language) are dropped, not merged, and listed in the rejected-rows download.
- 65k rows import in ~17s.

**Retrieval + scoring** (`src/lib/keywords/`): Postgres full-text + trigram pull ~100-400 candidates, code scores them
(40% fact relevance, 20% product type + intent, 15% title suitability, 15% log-scaled demand, 10% category fit) and keeps the top 30.
**Attribute order is learned, not configured.** At import we measure, per word, where it sits among the other attribute words in your real keywords (volume-weighted), plus head-to-head word-pair evidence, per category where there's enough data. e.g. colours lead; "slip", "crossbody" and "wedding" hug the product noun; "leather" comes before "platform" in shoes. It's stored with the dataset version. A brand can still force an order with `attributeOrder` in settings.
Keywords with a colour/material/audience term the buyer didn't supply are excluded outright. Weights and attribute order are configurable.

## Recommendation pipeline (`src/lib/pipeline/`)
`POST /api/generations` starts a run in the background and returns an id; the client polls `GET /api/generations/:id` (status moves through
extracting, matching, searching, building, then completed / needs_input / failed).

1. **Facts:** Claude extracts structured facts; code then drops anything the buyer didn't write (grounding check). Conflicts or an unrecognised product type stop here, before any paid call.
2. **Keywords:** top 30 from the active dataset (see above).
3. **Live queries:** up to 3 (brand + env cap), planned in code: best dataset keyword, the buyer's details in learned order, an alternative phrasing. Cache-first (7 days), DataForSEO AU / English / desktop.
4. **Patterns + order:** SERP intent mix, wording, and the word order result titles use. Final order = the keyword list's order, unless 3+ result titles clearly (75%+) disagree for a word pair.
5. **Claude recommends** from a small evidence bundle (never the full dataset or raw SERP), then a **deterministic validator** checks: product noun present, no prohibited words, no word the buyer didn't supply, cited keywords/evidence ids exist, alternatives genuinely different. One repair call on failure, then it fails safe.
6. **Honest caps:** SERP down means max Medium confidence and a visible label; limited keyword evidence means Low, no primary keyword, no demand claimed.

Claude failure keeps all evidence; `POST /api/generations/:id/retry` resumes from it with no repeat SERP spend.
Set `PROVIDER_MODE=mock` to run the whole thing without paid keys (mock providers are deterministic stand-ins, labelled as such in output).
**Not yet exercised live:** the Anthropic and DataForSEO clients are tested against mocked responses only.

## Tests
`npm run typecheck && npm run lint && npm test`. Tests wipe data: set `TEST_DATABASE_URL` to a throwaway DB (CI uses its own empty one).

## Deploy (Render)
Push to GitHub, create a Blueprint from `render.yaml`. Set the `sync: false` secrets in the dashboard
(`ANTHROPIC_*`, `DATAFORSEO_*`, `APP_BASE_URL`). Migrations run pre-deploy. Then, in the Render shell:
`npm run db:seed` and `npm run user:create -- --username me --role owner`.

## Assumptions (brief section 19)
Defaults live in `prisma/seed.ts` and are editable per brand: max title 70 chars, order colour > feature > material > length > type,
AU / English / desktop SERPs, 7-day SERP cache, 3 live queries. Auth method = admin-assigned username + password.
