---
name: init
description: Initialize a handover profile for a project, role, or team transition. Sets up the knowledge store for extraction.
argument-hint: [project|role|team]
---

# Initialize Handover

Set up a new handover profile to begin the knowledge transfer process.

## Process

1. Check if `.handover/` already exists. If it does, inform the user and ask if they want to reinitialize.

2. Determine the handover type from `$ARGUMENTS` or ask the user:
   - **project**: Taking over a codebase or system
   - **role**: Transitioning into a new role
   - **team**: Joining an existing team

3. Ask the user for:
   - A name for this handover (e.g., "Backend API Takeover", "Senior Dev Onboarding")
   - A brief description of what they're taking over

4. Call `handover_init` to create the `.handover/` directory:
   ```
   handover_init({ dataDir: ".handover" })
   ```

5. Call `handover_create_profile` to create the profile:
   ```
   handover_create_profile({
     type: "project|role|team",
     name: "<name>",
     description: "<description>"
   })
   ```

6. After initialization, suggest next steps:
   - `/handover:extract <path>` to extract knowledge from the codebase
   - `/handover:extract <path> --docs` to extract from documentation
   - `/handover:extract <path> --git` to extract from git history
   - `/handover:ask <question>` to start asking questions

## Migration Check

If a `.handover/data/` subdirectory exists (old CLI format), suggest running `/handover:migrate` to import existing data.
