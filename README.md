# Product Name Optimiser

Evidence-led PDP product titles for retail brands. Built from the Claude build brief.
First brand: Sportsgirl. Multi-brand from day one.

**Status:** Phase 1 (foundation + client logins) done. Dataset admin, pipeline and buyer UI are Phases 2-4.

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

## Tests
`npm run typecheck && npm run lint && npm test` (tests need Postgres at `DATABASE_URL` and wipe users/brands, so use a dev DB).

## Deploy (Render)
Push to GitHub, create a Blueprint from `render.yaml`. Set the `sync: false` secrets in the dashboard
(`ANTHROPIC_*`, `DATAFORSEO_*`, `APP_BASE_URL`). Migrations run pre-deploy. Then, in the Render shell:
`npm run db:seed` and `npm run user:create -- --username me --role owner`.

## Assumptions (brief section 19)
Defaults live in `prisma/seed.ts` and are editable per brand: max title 70 chars, order colour > feature > material > length > type,
AU / English / desktop SERPs, 7-day SERP cache, 3 live queries. Auth method = admin-assigned username + password.
