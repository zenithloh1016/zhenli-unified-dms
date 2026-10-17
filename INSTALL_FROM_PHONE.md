# ZHENLI Unified DMS — Sequential Signing Login Fix V1.2

## Why this patch is needed
The existing Tencent EdgeOne admin endpoint issues an `HttpOnly; Secure; SameSite=Strict` session cookie. A cross-site iframe inside a GitHub Pages DMS cannot reliably receive or send that login cookie. The signing website works directly in Chrome/Brave because it is a first-party page. Changing cookies to `SameSite=None` would weaken the default protection and might still not work where third-party cookies are blocked.

This patch **removes only the DMS Signing iframe** and gives the Signing tab two direct buttons that open the original signing site in a **Capacitor Browser / Android Chrome Custom Tab** or a **new browser tab on web**. The EdgeOne source, secret keys, signed files, original requests, audit trail, Task Hub, Master Listing importer, and Supabase remain unchanged.

## Install using only an Android phone + GitHub Codespaces

1. Download `ZHENLI_DMS_Signing_Login_Fix_V1_2.zip` and upload the ZIP to the ROOT of your **existing** `zhenli-unified-dms` GitHub repository using `Add file → Upload files`, then **Commit changes**.
2. Return to your **existing GitHub Codespace** for `zhenli-unified-dms`. Open **Terminal**.
3. Run these commands one at a time:

```bash
git pull --ff-only origin main
unzip -o ZHENLI_DMS_Signing_Login_Fix_V1_2.zip -d .
python3 scripts/apply_signing_login_fix.py
node --check src/main.js
git diff -- src/main.js
git add src/main.js scripts/apply_signing_login_fix.py INSTALL_FROM_PHONE.md
git commit -m "Fix EdgeOne signing login from DMS using first-party browser"
git push origin main
```

If your `git diff` contains unexpected changes outside the Signing tab and launcher, STOP instead of committing.

4. Wait for GitHub Actions > `Deploy DMS Web and Build Android APK`. Confirm **Web** and **Android** are green. If only Web fails due to GitHub Pages, a green Android job still generates an APK artifact.
5. Open the website / install the NEW APK from the **Android artifact**. An already installed older APK cannot pick up this native web-content change without reinstalling its updated APK.
6. Log into DMS, tap **Signing**, then **Sign in / Open signing workspace**. On Android, the signing service opens in a trusted in-app browser (Custom Tab). Enter the existing **EdgeOne admin password** there.
7. If EdgeOne access protection reports 401/403: obtain a new complete temporary access URL from EdgeOne console. In DMS > Signing paste it under **Temporary EdgeOne protected access URL**, tap **Save for session**, then use **Sign in / Open signing workspace**. Do not put `eo_token` in source, GitHub variables, or the repository.

## What stays unchanged
- Your original Tencent EdgeOne deployment and cloud-functions are **not redeployed or modified**.
- No signing request, signed PDF, signature placement, audit log, cloud storage, private keys, or admin password is changed.
- All Task Hub and DMS database code is untouched.
- This patch works with both DMS V1.0 and the earlier Master Listing Import Fix V1.1 since it modifies only the signing section.

## Important limitation
Browser security restrictions mean that the existing signing login cannot reliably stay inside a **cross-origin HTML iframe**. Android Chrome Custom Tabs appear within the app's navigation flow and allow normal first-party cookies, but are not literally embedded in the DMS tab. This is intentional and safer than weakening authentication cookies. If you need the entire signing UI displayed within the same DMS page and sharing a single login, that requires a more substantial same-origin gateway or first-party authentication integration, not this patch.

## Support
If the native launcher fails to open, check `@capacitor/browser` is present in `package.json` and the GitHub Android workflow runs `npx cap sync android` (the bundled unified DMS V1 source already has both). The admin EdgeOne `APP_SECRET` and `ADMIN_PASSWORD` should **not** be changed to resolve an iframe cookie problem.
