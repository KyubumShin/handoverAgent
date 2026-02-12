---
name: map
description: Display a visual knowledge map showing coverage across all handover categories.
argument-hint:
---

# Knowledge Map

Show a visual overview of knowledge coverage across all categories.

## Process

1. Call `handover_get_profile` to load the profile.
2. Call `handover_topic_summary` to get entry counts per category.
3. Call `handover_get_status` for overall stats.

## Output

Render an ASCII knowledge map:

```
Knowledge Map: [Handover Name]
Type: project | Entries: 15 | Last Updated: 2026-02-12

Category        Coverage    Entries  Topics
─────────────────────────────────────────────
architecture    ████████░░   80%     4  System design, API layer, Database schema, Auth flow
codebase        ██████░░░░   60%     3  File structure, Build system, Entry points
tool            ████░░░░░░   40%     2  Jest, Docker
convention      ██░░░░░░░░   20%     1  Naming conventions
process         ░░░░░░░░░░    0%     0  ← needs attention
people          ░░░░░░░░░░    0%     0  ← needs attention
decision        ░░░░░░░░░░    0%     0
domain          ░░░░░░░░░░    0%     0
─────────────────────────────────────────────
Overall: 42%
```

Use filled blocks (█) and empty blocks (░) proportional to coverage percentage (10 blocks total).

Mark categories with 0 entries that are required for this handover type with "needs attention".

Suggest `/handover:gaps` for detailed gap analysis and recommended questions.
