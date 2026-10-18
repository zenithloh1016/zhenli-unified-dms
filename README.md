# ZHENLI Unified Document Management System V1.0

Please read **[START_HERE.md](START_HERE.md)** for the new combined web and Android build, Supabase setup, Task Hub V3 cloud sync migration, and Sequential Signing EdgeOne access.

Includes revised Documents, Tasks, Signing and Overview tabs inspired by the provided screenshot. The previous DMS guide is preserved at `README_ORIGINAL_DMS_REFERENCE.md` for reference.

## Annual Return V1.5 — integrated into DMS website and Android APK

- After DMS login, select **Annual Return** in the top navigation or the Overview shortcut. The generator is bundled locally under `dist/annual-return/`, rather than navigating to another service.
- **Company Details → statutory sections → Director Confirmation → PDF export**. Removes TIN, Company Review and Verification Notes, director/secretary appointment dates, member-entry dates, BO becoming/cessation and BO notice dates, and signing date/acknowledgement from the form and PDF; old `.gs` and JSON data is filtered.
- The **Director Confirmation** includes name, NRIC/passport number, capacity and a signature line. No signing date or separate acknowledgement.
- Existing MSIC 2008 search (max 3), share/BO selectors, additional Directors/Members/Charges/BOs and bilingual PDF generation remain available.
- **The DMS does not silently store Annual Return drafts or generated PDFs in Supabase.** Export the editable JSON first, then download the PDF and upload it to the correct **Documents** company folder. Navigating away warns about unsaved drafts.
- DMS Android builds run `annual-return` tests, build the generator, bundle it via `node scripts/bundle-annual-return.mjs`, and then synchronize Capacitor and compile the DMS APK. The standalone Annual Return APK is still separately buildable.
- Live DMS document/Task Hub data are unchanged; EdgeOne signing and its credentials, existing requests and signed documents are not modified.

