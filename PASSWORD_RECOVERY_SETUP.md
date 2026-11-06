# UNICOSEC password recovery and Supabase redirect configuration

The UNICOSEC forgot-password form issues a Supabase reset email. A successful reset needs an approved callback URL and a clickable, unmodified confirmation URL in the email.

## Supabase Dashboard settings

Open **Authentication → URL Configuration** for project `dzhsfqhhefwfzdrvivaj`:

- **Site URL**: `https://zenithloh1016.github.io/zhenli-unified-dms/`
- **Redirect URLs**: include these exact entries:
  - `https://zenithloh1016.github.io/zhenli-unified-dms/`
  - `https://zenithloh1016.github.io/zhenli-unified-dms/password-recovery/`

Do not use the Supabase API origin, `localhost`, or a GitHub repository *source-code URL* as the Site URL. The application uses the Site URL as the email callback and immediately routes recovery tokens into the dedicated password recovery form. The direct reset page remains supported for emails issued before this change.

Go to **Authentication → Email Templates → Reset Password** and verify that the clickable reset link contains `{{ .ConfirmationURL }}` (or another approved Supabase token-hash verification flow). A link using only `{{ .SiteURL }}` or `{{ .RedirectTo }}` is **not** a valid recovery verification link.

## After deployment

1. Open the UNICOSEC login website and choose **Forgot password?**
2. Request a new recovery email using the currently confirmed login email.
3. Tap the *latest* reset email's verification link. If Gmail's in-app browser cannot open it, choose **Open in browser**, preferably Chrome.
4. The published UNICOSEC app routes the recovery token to `/password-recovery/` and offers the password reset form only when Supabase confirms a valid session.
5. Choose a new password of at least 12 characters. The reset page signs out, so the next login requires the new credentials.

If the email redirects to a Supabase API error page or a different host, re-check the Site URL and Redirect URLs. If it opens a page without a verification token or with an `otp_expired` error, request a new link; links expire and are single use. If a PKCE reset link is opened in a different browser or device from the originating request, the verifier may be unavailable; request the email again from the same browser.

## Safety

Never share the full recovery link, access token, refresh token, PKCE code, or password. The callback stays at the same website origin, the new password is updated using `auth.updateUser` after verifying the recovery session, and existing company data and Supabase user IDs are untouched. All normal UNICOSEC logins still require manually entering email and password.
