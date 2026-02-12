---
name: feedback
description: Rate the last handover answer or view feedback statistics.
argument-hint: [positive|negative|stats] [comment]
---

# Feedback

Record feedback on handover answers or view feedback statistics.

## Usage

- `/handover:feedback positive` - Rate last answer as helpful
- `/handover:feedback negative not detailed enough` - Rate with comment
- `/handover:feedback stats` - View feedback statistics

## Process

### Rating Feedback

1. Parse `$ARGUMENTS` for rating (positive/negative) and optional comment.
2. Call `handover_log_feedback`:
   ```
   handover_log_feedback({ rating: "positive|negative", comment: "<optional>" })
   ```
3. Acknowledge the feedback briefly.

### Viewing Stats

1. Call `handover_feedback_stats`.
2. Display:
   ```
   Feedback Summary
     Total interactions: 12
     Positive: 10 (83%)
     Negative: 2 (17%)
   ```
