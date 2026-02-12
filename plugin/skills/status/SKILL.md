---
name: status
description: Show the current status of your handover - profile info, knowledge entries, and progress.
argument-hint:
---

# Handover Status

Display a summary of the current handover state.

## Process

1. Check if `.handover/` exists. If not, suggest `/handover:init`.
2. Call `handover_get_status` to get all stats.
3. Call `handover_get_profile` for profile details.

## Output

```
Handover: [Name]
Type: project | Created: 2026-02-10 | Last Updated: 2026-02-12

Knowledge Base
  Entries: 15
  Categories: architecture (4), codebase (3), tool (2), convention (1), ...
  Sources: 3 extractions (codebase, docs, git)

Interactions
  Questions asked: 8
  Feedback: 6 positive, 1 negative (86% satisfaction)

Quick Actions
  /handover:extract <path>  - Add more knowledge
  /handover:ask <question>  - Ask a question
  /handover:gaps            - Find missing topics
  /handover:map             - Visual coverage map
```
