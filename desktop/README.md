# UNICOSEC — Windows Desktop

This Electron app provides a dedicated Windows desktop window for
**UNICOSEC - Company Secretarial Management System**.

The client connects to the existing secure web workspace at
https://zenithloh1016.github.io/zhenli-unified-dms/

It uses the same login, same Supabase database, same signing requests,
and same company files as the website. It does not create a new database
or embed authentication secrets. An internet connection is required.

## Windows download formats

- **UNICOSEC-Setup-1.0.0-x64.exe** — recommended installer. Creates
  Start Menu and desktop shortcuts; installs per user.
- **UNICOSEC-Portable-1.0.0-x64.exe** — standalone executable, without installation.

The Windows build workflow uploads both EXE files as GitHub Actions artifacts
and publishes them on the project's Releases page.

## Development

From the desktop folder:

    npm install
    python -m pip install Pillow
    python scripts/generate_icon.py
    npm test
    npm start
    npm run dist:win

Build the Windows packages on Windows. Do not change the desktop appId for
subsequent releases, so upgrades retain the same application identity.

## Security

The remote web page runs in a Chromium sandbox without Node.js integration.
Navigation to untrusted origins cannot open inside the app. External HTTP(S)
and email links open in the default browser. File downloads use the native
Save As dialog. The app does not store copies of statutory documents offline.

The installer is initially unsigned. Windows SmartScreen may show an
unrecognized publisher notice until a code-signing certificate is configured.
