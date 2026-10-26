# UNICOSEC — Windows Desktop

This Electron app provides a dedicated Windows desktop window for
**UNICOSEC - Company Secretarial Management System**.

The client connects to the existing secure web workspace at
https://zenithloh1016.github.io/zhenli-unified-dms/

It uses the same login, same Supabase database, same signing requests,
and same company files as the website. It does not create a new database
or embed authentication secrets. An internet connection is required.

## Windows download formats

- **UNICOSEC-Setup-1.1.0-x64.exe** — recommended installer. Creates
  Start Menu and desktop shortcuts; installs per user. This version includes
  built-in desktop application update checking.
- **UNICOSEC-Portable-1.1.0-x64.exe** — standalone executable, without installation.
  Checks for newer versions and opens the official release page for replacement.

The Windows build workflow publishes both EXE files and `latest.yml` /
SHA-512 checksum update metadata together on the project's Releases page.
The installed (NSIS) edition checks on startup, every 6 hours, and via
**Help → Check for Desktop Updates…**. It asks before downloading and asks
again before restarting to install. It does not silently install updates.
The Portable edition checks the official releases feed and opens the download
page because it cannot safely replace its running executable.

**One-time upgrade:** v1.0.0 did not have any update-checking mechanism. If you
installed v1.0.0 previously, install Setup v1.1.0 once. Future desktop releases
must increment the version in `desktop/package.json`, use the same app ID and
publish the NSIS setup alongside the matching `latest.yml`. Do not republish
different executable bytes under an unchanged release version.

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

The installer is currently unsigned. Windows SmartScreen may show an
unrecognized publisher notice until a code-signing certificate is configured.
The updater relies on HTTPS and the published SHA-512 metadata for artifact
integrity. These checks are not a replacement for Authenticode signatures or
signed update manifests; configure release signing before broad distribution.
Do not download executable updates from unofficial mirrors.
