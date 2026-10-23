# Supabase Direct Task Hub — ZHENLI Unified DMS

This replaces the former hosted Tencent EdgeOne Task Hub without rebuilding or changing its user interface. **Supabase** is the private data backend; **GitHub Pages** serves the static interface, just like the DMS website. Tencent EdgeOne is not used for Task Hub hosting or storage.

## Access

- [Open full-screen standalone Task Hub](https://zenithloh1016.github.io/zhenli-unified-dms/task-hub-cloud/)
- [Open ZHENLI Unified DMS](https://zenithloh1016.github.io/zhenli-unified-dms/) then click **Tasks → Task Hub** or **Open standalone Task Hub**.
- Use the **same login credentials** as your existing DMS. This is *not* a public task list. Access is governed by the existing Supabase user session and `task_hub_state` row-level security.

## Preserved functions and data

The original Task Hub's task creation and editing, owner/assignee, priority, due date, checklists, recurring tasks, workflow status, Kanban, dashboard, calendar, AR/AFS deadlines, companies, filters, activity history, Master Listing import, JSON backups and CSV export remain in place. The iframe is the exact original `public/task-hub` source; **both DMS Tasks and standalone Task Hub read/write the same Supabase `task_hub_state` row for the signed-in user**.

The current Supabase project already has `task_hub_state` with row-level security enabled and task data populated. This feature does not alter or delete those rows or change existing Task Hub record formats. No new SQL migration or second data store is needed.

## Moving any tasks still held only on EdgeOne

If the old standalone Tencent EdgeOne page holds tasks that have not yet been synchronized to DMS, open the old site and **Export backup JSON**. In the new Supabase Task Hub, first **Export backup JSON** of the existing Supabase tasks. Then use **Import backup** for the old JSON only after reviewing the difference: the old Task Hub's built-in import **replaces** the current Task Hub tasks and companies, rather than merging. Never import a confidential backup into the public GitHub repository.

## How cloud synchronization works

1. GitHub Pages serves a standalone Supabase-authenticated wrapper at `/task-hub-cloud/`.
2. The wrapper validates the logged-in Supabase account and obtains the private company names using that user's RLS policies.
3. It embeds the **unchanged original Task Hub** in a same-origin iframe.
4. The existing tested DMS bridge loads and upserts `task_hub_state` for the same authenticated user, including task creation, checklist edits, recurring tasks and company updates.
5. Company names from the DMS portfolio are merged non-destructively by the original bridge.

The direct URL `/task-hub/` now redirects to the authenticated standalone Task Hub when opened outside DMS, preventing accidental unsynced local-only editing.

**Operational caution:** This is cloud-synced application state; it is not multi-user realtime collaborative editing. Avoid simultaneously editing the same Task Hub under the same login in different tabs/devices without refreshing, and export regular JSON backups. The existing one-row JSON storage architecture remains unchanged and independent of EdgeOne.

The Tencent EdgeOne **Sequential Signing** integration is a separate provider and is not changed by this Task Hub update.
