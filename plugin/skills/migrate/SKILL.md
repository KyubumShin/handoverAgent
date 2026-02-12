---
name: migrate
description: Import existing handover data from the CLI version (handover-agent) into the plugin format.
argument-hint: [path-to-old-data]
---

# Migrate CLI Data

Import data from an existing handover-agent CLI installation.

## Process

1. Determine the old data directory:
   - If `$ARGUMENTS` provides a path, use it
   - Otherwise check `.handover/data/` (default CLI layout)
   - If neither exists, inform the user and exit

2. Call `handover_init` to ensure the new `.handover/` structure exists.

3. Call `handover_migrate` with the old data directory:
   ```
   handover_migrate({ oldDataDir: ".handover/data" })
   ```

4. Report the migration results:
   ```
   Migration Complete
     Entries migrated: 15
     Entries skipped (duplicates): 2
     Profile: migrated
     Feedback history: migrated
     Errors: 0
   ```

5. Suggest next steps:
   - `/handover:status` to verify everything looks right
   - `/handover:map` to see coverage
   - The old `.handover/data/` directory can be safely deleted after verifying
