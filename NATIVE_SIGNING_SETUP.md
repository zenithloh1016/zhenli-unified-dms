# ZHENLI DMS — Supabase native sequential signing (EdgeOne alternative)

Status: **integration / pilot; not approved for live statutory documents yet**.
This is a separate service. It does not migrate, modify or delete EdgeOne requests,
signatures, Blob objects, SMTP sender settings, audit history, or DMS files.

## What it does

- DMS Signing tab has a provider switch: **Supabase signing (independent)** or **Existing Tencent EdgeOne**.
- Create draft requests for 1–15 ordered signers, upload 1–8 PDFs (up to 3 MB each,
  no rotated pages), assign signature boxes in percentage coordinates, activate and send
  the first invitation, and manually copy signer links.
- After reviewing private PDFs, the recipient draws a signature and confirms their
  exact name and consent. A database row lock accepts signatures **only in order**.
- After the final signer the Edge Function stamps each PNG into the assigned original
  PDF pages, records output hashes, and stores the final PDFs privately.
- Revocation, expiry, per-signer token, manual resend, and finalization retry supported.
- **No account creation required for recipients**. Possession of a signing URL
  is treated as possession of the signer credential. This is **not strong identity
  verification** or PKI/certified digital signing.

## One-time setup in the existing Supabase project

1. Back up your Supabase project and private documents. Do not create a new project
   and do not run the old `supabase/setup.sql` again.
2. Open Supabase Dashboard → SQL Editor. Review and execute only
   `supabase/native-sequential-signing.sql`. This adds an isolated table, a
   **private** bucket `dms-native-signing`, and a restricted atomic-signature RPC.
   It does not change your existing DMS tables or `dms-private` bucket.
3. Create a random signing secret of at least 32 characters, store it as an Edge Function
   secret called `NATIVE_SIGNING_SECRET`. **Do not publish this secret or rotate it while
   active requests remain**; rotation invalidates all outstanding links.
4. Set `PUBLIC_SIGNING_URL` to your final public DMS signing page, for example
   `https://zenithloh1016.github.io/zhenli-unified-dms/sign/` after the web
   deployment. For best deliverability, use a verified custom HTTPS domain.
5. Set `DMS_ALLOWED_ORIGINS` to the exact scheme + host of your DMS website,
   e.g. `https://zenithloh1016.github.io` (add comma-separated
   `http://localhost:5173` for local tests; include your Android webview
   origin only when verified). Do not use `*`.
6. Deploy the Edge Function in the **same existing project**:
   `supabase functions deploy dms-sequential-signing --no-verify-jwt`
   with the Supabase CLI authenticated to **your intended project**.
   The file `supabase/config.toml` sets `verify_jwt = false`, because
   recipients have no DMS accounts. The function itself checks the current DMS
   user JWT for every admin action and an HMAC token for every recipient action.
7. Make sure the DMS GitHub Actions variables `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` are set to the **same** existing Supabase project.
   They are public client configuration, never the service-role secret.
8. Merge the feature PR and let the normal DMS workflow deploy the website. A
   separate `/sign/` page is included in the Vite build. Sign in to DMS →
   Signing → **Supabase signing (independent)** → Create signing request.

## Optional automatic email

Without a verified sender, the service is still usable by manually sharing the
recipient's **Copy signer link** URL from DMS. To send automatic emails:

1. Verify a domain you control with a transactional provider, e.g. Resend.
2. Set private function secrets `RESEND_API_KEY` and
   `SIGNING_FROM_EMAIL` (an approved From address on that verified domain).
3. Publish and confirm the provider's SPF/DKIM settings and appropriate DMARC,
   use consistent company identification, and check deliverability with
   real test recipients before client use.
4. Recipient systems such as Outlook may still classify a link or email as unsafe
   or as Junk. A new hosting provider alone cannot bypass security warnings.
   If a link is falsely flagged, use Microsoft's official false-positive process.

## Test before live use

- Use dummy company names, fake/test PDFs and internal test emails only.
- Create 2 signers, upload an upright one-page PDF, preview it, and enter a
  box for EACH signer.
- Check the second signer cannot view/sign before the first.
- Activate; test manual invitation when no verified sender is configured.
- Sign with signer 1, then signer 2. Download final PDF and confirm both
  signatures appear correctly *within their designated boxes*.
- Confirm signed PDFs remain private, expiry and revocation work, and each signer
  link belongs only to its intended request.
- Test any Android APK separately after the deployed web workflow completes.
- Arrange a security/privacy assessment (signer identity, permission model,
  audit completeness, storage retention, race conditions, Malaysian legal
  acceptance for your exact corporate documents) before handling real clients.
  This is an MVP, **not a certified e-signature service**.

## Files

- `supabase/native-sequential-signing.sql` — new isolated schema, private bucket,
  atomic signature acceptance.
- `supabase/functions/dms-sequential-signing/index.ts` — secured signing,
  optional email, PDF processing.
- `supabase/config.toml` — public signer access with internal validation.
- `src/signing-supabase.js` — DMS administrator UI.
- `sign/index.html`, `src/signing-public.js` — recipient signing page.
- `src/main.js`, `vite.config.js` — provider selector and website build.

**Existing EdgeOne requests must remain available until independently completed.
Never copy legacy request URLs into the new system or change the APP_SECRET
in the old EdgeOne project as part of this rollout.**
