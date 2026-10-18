# ZHENLI Annual Return PDF Generator (Web + Android)

Standalone client-side Annual Return **particulars review** PDF tool. Based on archived Google Apps Script `Annual Return Review Form (revised)(1).gs`, dated 9 October 2026. Uses the same seven main bilingual sections, section headings, 121 particulars, company summary and director acknowledgement. Source schema deliberately omits ALL client values and personal names.

## Development & deployment

- `npm install && npm run dev` for local website.
- `npm run build` creates `dist/` static assets; deploy with GitHub Pages / Tencent EdgeOne / other HTTPS static hosting.
- `npx cap add android && npm run android:sync && cd android && ./gradlew assembleDebug` requires Android SDK / JDK 21. APK at `android/app/build/outputs/apk/debug/app-debug.apk`.
- `vite build --base=/zhenli-unified-dms/annual-return/` when publishing as a subdirectory under the existing GitHub Pages site.
- No API keys, Google Drive permissions, Supabase connection or online PDF server required.

## Workflow

1. Enter company particulars manually or import a company-specific Google Apps Script `.gs` file containing `const AR_SINGLE_COMPANY = {...};` or previously exported review JSON.
2. Confirm/edit bilingual particulars and director confirmation details.
3. Click Refresh preview and Generate PDF. Android uses the Files/Drive share sheet; on the web a browser file download begins.
4. Optionally export a private editable JSON draft. This draft is **not** automatically backed up or synced.

## Security and fidelity

- Import/parsing and PDF generation happen on-device; files are not sent to a server.
- The template schema strips company-specific identifiers and values. Never commit filled drafts, source company scripts or real NRIC records to a public GitHub repository.
- PDF uses html2canvas + jsPDF raster pages to preserve Chinese text through installed system fonts. Output text may not be searchable/selectable; print at A4. Extremely long values should be reviewed for clipping.
- This is **not** a prescribed SSM Annual Return, electronic filing, statutory submission, or an actual filing acknowledgement. Review dates and all particulars with the company records before lodgement.
- A Google Apps Script Drive PDF may not exactly match raster typography or pagination.