# UNICOSEC — Resend Custom SMTP Setup (manual secure configuration)

**Purpose:** Prevent Supabase Auth from rejecting password-reset, signup confirmation and email-change messages with `over_email_send_rate_limit` (HTTP 429).

**Scope:** Existing Supabase project `dzhsfqhhefwfzdrvivaj`. No new Supabase project, database migration, email-address change, new user account, or app-side SMTP key is needed. The app keeps using Supabase Auth APIs as before.

**Security:** SMTP configuration and the Resend API key must remain only in provider/Supabase secure dashboards. Never paste these credentials into UNICOSEC's GitHub repository, `VITE_*` environment variables, any frontend app, issue or chat. Do not change the `auth.users` table to bypass password recovery.

## 1. Create Resend sender

- Open https://resend.com/domains and add an **email-sending domain you own and control** (for example, a dedicated subdomain `auth.your-company-domain.example`; this is *only* an example).
- Follow Resend's DNS instructions to verify the sending domain and configure DKIM/SPF records. Do not claim the domain is ready before Resend shows **Verified**.
- Create a Resend API key with sending permission: https://resend.com/api-keys
- Choose an address on that verified domain (e.g. `no-reply@auth.your-company-domain.example`). The user's Gmail login address is a **recipient**, not a substitute for a verified sending domain.

## 2. Set up Supabase Auth SMTP

Open https://supabase.com/dashboard/project/dzhsfqhhefwfzdrvivaj/auth/smtp

Enable **Custom SMTP** and configure:

| Supabase setting | Value |
|---|---|
| Sender email | Your chosen email on the **verified** domain |
| Sender name | `UNICOSEC` |
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `465` |
| SMTP Username | `resend` |
| SMTP Password | **Private Resend API key**; enter in the dashboard, not GitHub |
| Custom SMTP toggle | Enabled |

Save the configuration. Resend's official guide: https://resend.com/docs/send-with-supabase-smtp

Do **not** turn off email confirmation or try to set the password by editing database records.

## 3. Auth redirect and email template

Open https://supabase.com/dashboard/project/dzhsfqhhefwfzdrvivaj/auth/url-configuration

- Site URL: `https://zenithloh1016.github.io/zhenli-unified-dms/`
- Allowed redirect: `https://zenithloh1016.github.io/zhenli-unified-dms/`
- Allowed redirect: `https://zenithloh1016.github.io/zhenli-unified-dms/password-recovery/`

In Supabase **Authentication → Email Templates → Reset Password**, ensure the verification link uses `{{ .ConfirmationURL }}`, not just `{{ .SiteURL }}`.

## 4. Rate limiting and protections

Open https://supabase.com/dashboard/project/dzhsfqhhefwfzdrvivaj/auth/rate-limits

When custom SMTP is active, Supabase currently starts with an email cap of **30/hour** (subject to change). For an internal tool, keep a modest, reasonable cap unless your tested traffic needs more. Keep address-specific and recovery throttling enabled; do not set unlimited requests. Use CAPTCHA if email-based signup is open to the public.

## 5. End-to-end check

- Request **one** fresh reset email from the public UNICOSEC login website, using the account's currently confirmed address.
- Check delivery in Resend's activity logs and the recipient inbox.
- Open the **newest** link in a standard browser and confirm the UNICOSEC reset page appears. Do not paste the full verification link into a ticket or chat: it may contain single-use credentials.
- Set a new password of 12+ characters. Confirm you can sign back in with that password, then confirm existing company documents and drafts remain present.
- If the email is sent but no usable link opens, inspect the Supabase Auth URL configuration and Reset Password template. If email delivery fails, inspect Resend's activity logs and Supabase Authentication logs.

## What was done in UNICOSEC source

- Existing browser-side `resetPasswordForEmail` remains the only mechanism for sending recovery messages.
- Recovery URLs and reset page are already implemented.
- When a provider rejects an email with `over_email_send_rate_limit`, UNICOSEC now explains that the hosted SMTP allowance is exhausted, rather than showing an opaque error.
- SMTP credentials are **not** stored in the UNICOSEC frontend code.

**Outstanding external prerequisite:** A verified domain and a Resend API key must be set up by the project administrator in Resend/Supabase. These are account-level controls unavailable through the existing code repository or Supabase database access.

References:
- https://resend.com/docs/send-with-supabase-smtp
- https://supabase.com/docs/guides/auth/auth-smtp
