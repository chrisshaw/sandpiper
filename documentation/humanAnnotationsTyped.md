---
title: "Typed & Per-Session Human Annotations"
tags: ["human-annotations", "per-session", "runs", "evaluation"]
category: "Analysis"
isPublished: true
---

# Typed & per-session human annotations

## Overview

This build extends **[Human Annotations](humanAnnotations)** in two ways: values can be typed (boolean, number) so they compare correctly against LLM runs, and run sets with the **[per-session](perSession)** annotation type get a session-level template instead of one row per utterance.

## Boolean and typed fields

Schema fields have a **type** — string, number, or boolean (see **[Schema](schema)**). Code each value to match its field's type so it imports as a real value rather than plain text:

- **Boolean fields:** enter `TRUE` or `FALSE`. Case does not matter, and `true`/`false`, `1`/`0`, and `yes`/`no` are also accepted — so a spreadsheet checkbox that exports as `TRUE`/`FALSE` works as-is. On import these become real booleans, so they display as a **checkbox** (just like LLM boolean annotations) and compare correctly against LLM values in an evaluation.
- **Number fields:** enter a plain number such as `4`; it imports as a number.
- **String / coded fields:** enter the schema code, e.g. `PRAISE`.

Sandpiper reads each field's type from the LLM runs already in the run set (the same runs whose fields the template offers). If a field has no typed LLM run to learn from, its values are kept as text.

### Why types matter for evaluations

**Values are compared as exact strings** in the **[Evaluation](evaluation-equations)** tab. Every annotation value is stringified and matched with strict equality: `"PRAISE"` matches `"PRAISE"` but not `"praise"`, and a boolean `true` matches another `true` but not the text `"TRUE"`. This is why human labels must use the same codes and the same types as the LLM runs.

> **Coded a run before this was supported?** Human runs uploaded before typed import was added stored booleans as the literal text `"TRUE"`/`"FALSE"`, which do **not** match LLM booleans and make agreement scores in their evaluations untrustworthy. Existing runs are **not** converted automatically — re-download the template and re-upload those runs to fix their metrics.

## Per-session human runs

When the run set's annotation type is **[Per session](perSession)**, coding happens at the level of the whole session, not each utterance. The template reflects this: it has **one row per session** and only two context columns.

| Column       | Meaning                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `session_id` | the session identifier                                                                                                        |
| `content`    | the full transcript of that session (each line `role: content`), included read-only so you can code without leaving the sheet |

The `annotator[<name>][<slot>]<fieldKey>` columns work exactly as they do per-utterance. Enter one value per session in slot `0`; use extra slots only when a session can carry more than one value for a field.

On upload, these are stored as **session-level annotations** — the same shape an LLM per-session run produces — so a per-session human run lines up correctly against LLM runs in an evaluation. (A per-session template has no `sequence_id` or per-utterance `role`/`content` columns.)

## Related concepts

- **[Human Annotations](humanAnnotations)** — The template/upload workflow this page extends
- **[Per Session](perSession)** — Session-level annotation runs
- **[Schema](schema)** — Where field types are defined
- **[Evaluation Equations](evaluation-equations)** — The metrics computed over matched values
