# Free demo deployment (Vercel + Render + Neon + Upstash)

For showing the site to a client. Not for real customers: free tiers sleep, lose uploaded files and have usage limits. Free-plan terms change, so check each provider's pricing page before relying on this. Vercel's free plan is for non-commercial use.

```
Browser → Vercel (Next.js)  ── rewrites /api/v1 and /media-public ──►  Render (API)  → Neon (Postgres)
                                                                                    → Upstash (Redis)
```

The browser only talks to the Vercel URL, so the refresh cookie stays first-party.

## 0. Put the code on GitHub
Create a private repo and push the project (`.env` is git-ignored; never commit it).

## 1. Database: Neon
1. Create a project at neon.tech. Copy two connection strings: the **pooled** one (host contains `-pooler`) and the **direct** one.
2. `DATABASE_URL` = pooled string with `?sslmode=require`. `DIRECT_URL` = direct string with `?sslmode=require`.

## 2. Redis: Upstash
Create a Redis database, copy the `rediss://...` URL as `REDIS_URL`. Rate limits and background jobs use it. If the free command quota runs out, the API's `/ready` check fails; upgrade or switch to a Render Key Value instance.

## 3. Email: Brevo (or any SMTP)
Production mode requires SMTP (verification, password reset and admin MFA links are emailed). Create a free Brevo account, verify a sender address, and copy the SMTP host, port 587, login and key. Set `EMAIL_FROM` to the verified sender. Without working email, new users cannot verify their address, but the seeded demo account (`demo@ash.test`) is already verified.

## 4. API: Render
1. Render dashboard → New → Blueprint → pick the repo. It reads `render.yaml`.
2. Fill the prompted values. For now put a placeholder in `FRONTEND_ORIGIN`; you set it properly in step 6.
3. After deploy, open `https://<service>.onrender.com/health` (should say ok) and `/ready`.
4. Set `API_PUBLIC_URL` to the service URL.

At every boot the API syncs the schema (`prisma db push`), re-seeds the 12 demo watches and their images, and (if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set) creates the admin.

## 5. Web: Vercel
1. New Project → import the repo. **Root Directory:** `apps/web`. Keep "Include source files outside of the Root Directory" enabled.
2. Environment variable: `API_INTERNAL_URL` = your Render URL (no trailing slash). It is read at build time, so redeploy after changing it.
3. Optional: `NEXT_PUBLIC_CONTACT_EMAIL`.
4. Deploy and copy the production URL.

## 6. Connect them
In Render set `FRONTEND_ORIGIN` to the exact Vercel URL (`https://...vercel.app`, no trailing slash, it is the CSRF origin) and redeploy the API. Sign in at the Vercel URL with `demo@ash.test` / `Demo-Customer-2026!`, add a watch, check out with Cash on delivery.

## Admin sign-in
Admins must enrol an authenticator app. On first admin login the enrolment link is emailed, so SMTP must work.

## Known limits of this setup
- Render free sleeps after about 15 minutes idle; the first request afterwards takes 30 to 60 seconds. Open the site yourself before a client meeting.
- Uploaded product photos are lost on restart (temporary disk). Seeded demo images come back at boot. For permanent photos use S3-compatible storage (`MEDIA_STORAGE_PROVIDER=s3`).
- Search runs on Postgres full-text only (`SEARCH_ENABLED=false`, no Chroma).
- Online card payment needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (webhook URL: `https://<render-url>/api/v1/payments/webhook`); without them use Cash on delivery.
- The demo customer's password is public in the repo. Do not use this setup for real customers or real data.
- Not tested: this exact Render/Vercel/Neon/Upstash setup was written from the project's config and docs but could not be run from the build sandbox (no access to those services).
