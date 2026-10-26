UNICOSEC Windows desktop installer.

Build: cd windows; npm install; npm run dist:windows.

Produces UNICOSEC-Setup-1.0.0-x64.exe (Windows 10/11 x64).

Uses the live UNICOSEC website with its existing Supabase data; internet required. Desktop icon generated from public/favicon.svg. The installer is not code-signed, so Windows SmartScreen may warn about an unknown publisher.
