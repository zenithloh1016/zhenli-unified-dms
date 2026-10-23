# Supabase Direct Task Hub — ZHENLI Unified DMS

The **Supabase Task Hub is the only Task Hub option inside ZHENLI DMS**. **Supabase** stores private task and company records; **GitHub Pages** serves the original interface. There is no external Task Hub URL setting or Tencent EdgeOne Task Hub connection.

## Access

- [Open full-screen standalone Task Hub](https://zenithloh1016.github.io/zhenli-unified-dms/task-hub-cloud/)
- [Open ZHENLI Unified DMS](https://zenithloh1016.github.io/zhenli-unified-dms/) then click **Tasks → Task Hub** or **Open standalone Task Hub**.
- Use the **same login credentials** as your existing DMS. This is *not* a public task list. Access is governed by the existing Supabase user session and `task_hub_state` row-level security.

## Preserved functions and data

The original Task Hub's task creation and editing, owner/assignee, priority, due date, checklists, recurring tasks, workflow status, Kanban, dashboard, calendar, AR/AFS deadlines, companies, filters, activity history, Master Listing import, JSON backups and CSV export remain in place. The iframe is the exact original `public/task-hub` source; **both DMS Tasks and standalone Task Hub read/write the same Supabase `task_hub_state` row for the signed-in user**.

The current Supabase project already has `task_hub_state` with row-level security enabled and task data populated. This feature does not alter or delete those rows or change existing Task Hub record formats. No new SQL migration or second data store is needed.

## Backup and restore

Use **Settings → Export backup JSON** inside the Supabase Task Hub to retain a local backup. Before importing any backup JSON, export the current Supabase tasks first: the existing **Import backup** action replaces the current Task Hub's tasks and companies rather than merging them. Never upload confidential task records to a public GitHub repository.

## How cloud synchronization works

1. GitHub Pages serves a standalone Supabase-authenticated wrapper at `/task-hub-cloud/`.
2. The wrapper validates the logged-in Supabase account and obtains the private company names using that user's RLS policies.
3. It embeds the **unchanged original Task Hub** in a same-origin iframe.
4. The existing tested DMS bridge loads and upserts `task_hub_state` for the same authenticated user, including task creation, checklist edits, recurring tasks and company updates.
5. Company names from the DMS portfolio are merged non-destructively by the original bridge.

The direct URL `/task-hub/` now redirects to the authenticated standalone Task Hub when opened outside DMS, preventing accidental unsynced local-only editing.

**Operational caution:** This is cloud-synced application state; it is not multi-user realtime collaborative editing. Avoid simultaneously editing the same Task Hub under the same login in different tabs/devices without refreshing, and export regular JSON backups. The existing one-row JSON storage architecture remains unchanged and does not depend on any external Task Hub service.

The Tencent EdgeOne **Sequential Signing** integration is a separate provider and is not changed by this Task Hub update.

## Removed legacy Task Hub controls

The obsolete hosted Task Hub URL field, remote hosted-site launcher, and Task Hub connection-settings dialog have been removed from the DMS interface and code. Old browser preferences are ignored. **This code update does not delete a separately hosted Tencent EdgeOne project or deployment**; that must be retired through its original provider account if one still exists. The separate EdgeOne *signing* provider remains unchanged.
