---
name: gaps
description: Analyze knowledge gaps in your handover. Identifies missing topics and suggests questions to fill them.
argument-hint:
---

# Gap Analysis

Identify what's missing from the handover knowledge base and prioritize what to learn next.

## Process

1. Call `handover_get_profile` to load the profile and determine the handover type.

2. Call `handover_list_entries` to get all knowledge entries.

3. Call `handover_topic_summary` to get entry counts per category.

4. If no entries exist, suggest running `/handover:extract` first.

5. Analyze coverage based on the handover type:

### Required Categories by Type

| Handover Type | Required | Nice-to-Have |
|---------------|----------|--------------|
| **project** | architecture, codebase, tool, convention, process, decision | people, domain |
| **role** | process, people, tool, domain | decision, convention |
| **team** | people, process, convention, tool | architecture, domain |

### Coverage Calculation

For each category:
- 1 entry = 20% coverage
- 3 entries = 60% coverage
- 5+ entries = 80% max from entries alone
- Q&A engagement adds up to 20% bonus

### Gap Identification

Analyze what's MISSING. Consider:
1. Required categories with 0 entries = **critical** gap
2. Required categories with only 1 entry = **high** gap
3. Nice-to-have categories with 0 entries = **medium** gap
4. Categories with only low-confidence entries = **medium** gap

For each gap, provide:
- The specific topic that's missing
- Why it matters for this type of handover
- 2-3 suggested questions to fill the gap

## Output Format

Present results as:

### Overall Coverage: X%

### Knowledge Map
```
architecture  ████████░░  80%  (4 entries)
codebase      ██████░░░░  60%  (3 entries)
process       ██░░░░░░░░  20%  (1 entry)
people        ░░░░░░░░░░   0%  (0 entries)  ← CRITICAL GAP
...
```

### Critical Gaps
1. **[Topic]** (category) - Why it matters
   - Suggested: "Question to ask?"

### Recommendations
- Actionable steps to improve coverage
