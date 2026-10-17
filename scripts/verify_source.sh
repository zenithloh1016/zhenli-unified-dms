#!/usr/bin/env bash
set -euo pipefail
node --check src/main.js
node --check src/integrated-modules.js
node --check public/task-hub/app.js
[ -f public/task-hub/index.html ] && [ -f supabase/task_hub_sync.sql ] && [ -f .github/workflows/deploy.yml ]
echo 'Source JavaScript syntax and integration file checks passed.'
