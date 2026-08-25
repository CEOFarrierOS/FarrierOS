# FarrierOS Integration Handoff

## Never Send These in Chat

- Account passwords or one-time login codes
- Supabase database password
- Supabase `service_role` key
- Stripe secret key, restricted key, or webhook signing secret
- Banking, tax, or identity-verification information

These values either stay inside the provider account or are entered directly into protected hosting environment variables when the server-side work needs them.

## Supabase — Needed First

After creating the project, open **Project Settings → API** and collect:

- Project URL → `VITE_SUPABASE_URL`
- Publishable/anon key → `VITE_SUPABASE_ANON_KEY`

These two browser-facing values are designed to be public. They are safe only because database Row Level Security remains enabled. Send the two values here, or copy `.env.example` to `.env.local` and paste them there yourself. Do not send the `service_role` key.

Also tell Codex the project reference shown in the Supabase URL. Codex will then help apply the SQL migration in `supabase/migrations` and verify authentication and security policies.

## Stripe — Needed After Accounts Work

Complete Stripe business verification, then create:

- Product: **FarrierOS Full Access**
- Price: **$7.99 USD**, recurring monthly

Safe values to provide:

- Publishable key beginning with `pk_test_` during beta
- Product ID beginning with `prod_`
- Monthly price ID beginning with `price_`

Current sandbox catalog:

- Product ID: `prod_V8dccwmIIuxtbR`
- Monthly price ID: `price_1U8MLGFu9lXqeICDSvx2qZny`

Do not paste `sk_` keys or webhook secrets here. Those will be entered directly into protected server/hosting settings when the billing backend is ready.

## Vercel — Needed for the Private Beta URL

Create the account and connect GitHub. Once the FarrierOS repository exists, tell Codex the GitHub repository name and Vercel team/account name. The final authorization prompts and production deployment approval remain yours.

Environment variables will be entered in **Vercel Project Settings → Environment Variables**. Browser-safe `VITE_` values may be shared, but server-only secrets should be entered by you directly in Vercel.

## Domain — Can Wait

The private beta can use a Vercel URL. Purchase the final domain in an account owned by you or your business. Never transfer domain ownership to a developer account.

## Current Connection State

The app continues using its local IndexedDB records until Supabase is configured and a user signs in. This avoids losing or accidentally uploading prototype records. Cloud migration will require an explicit review-and-import step.
