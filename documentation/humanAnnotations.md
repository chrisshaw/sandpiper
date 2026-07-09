---
title: "Human Annotations"
tags: ["human-annotations", "runs", "evaluation"]
category: "Analysis"
isPublished: true
---

# Human Annotations

## Overview

**Human Annotations** allow you to upload manually coded labels into Sandpiper, creating **Human Runs** that can be directly compared against LLM runs in an **Evaluation**. This is essential for measuring the accuracy of LLM annotations against a human gold standard.

When you upload a CSV of human annotations, Sandpiper validates the data, matches it to the sessions in your **Run Set**, and creates one human run per annotator. These human runs then appear alongside LLM runs in the evaluation, enabling calculation of **Precision**, **Recall**, **F1**, and **Cohen's Kappa** between human and LLM annotators.

## How to use

### Downloading the Annotation Template

1.  **Open a Run Set:** Navigate to the **Run Set** where you want to add human labels.
2.  **Download Template:** From the Run Set dropdown menu, click **"Download Annotation Template"**. You can configure how many annotator slots to include per field before generating the CSV (see the definition of a **slot** below).
3.  **Review the Template:** The template's shape follows the run set's **[Annotation Type](annotationType)**. For a **[per-utterance](perUtterance)** run set, the CSV has **one row per utterance** with these columns (for **[per-session](perSession)** run sets, see [Per-session human runs](#per-session-human-runs) below):
    - `session_id` — the session identifier
    - `sequence_id` — the position of the utterance within the session
    - `role` — the speaker role (e.g. Tutor, Student)
    - `content` — the utterance text
    - One annotation column per **annotator**, per **field**, per **slot**, using the naming format `annotator[<name>][<slot>]<fieldKey>` (for example, `annotator[joe][0]TUTOR_MOVE`). Each part of the name means:
      - **`<name>`** — the annotator's name (e.g. `joe`). Each distinct name becomes its own Human Run. This is the only identifier of _who did the coding_ — it is **not** tied to a tutor or student.
      - **`<slot>`** — a zero-based index (`0`, `1`, `2`, …) that lets a **single annotator record more than one value for the same field on the same utterance**. You choose how many slots each field gets when downloading the template; a field with 2 slots produces `annotator[joe][0]TUTOR_MOVE` and `annotator[joe][1]TUTOR_MOVE`. **A slot is _not_ a tutor ID** — speakers are identified by the `role` column, and each utterance by `session_id` + `sequence_id`. Most coding uses only slot `0`; extra slots exist for multi-label fields where one utterance can carry more than one code.
      - **`<fieldKey>`** — the `fieldKey` of a field defined in your **[Prompt Schema](schema)**. Every field in the schema generates its own annotation column(s) here, and the values you enter should be that field's schema codes (e.g. `PRAISE`, `NOT_PRAISE`). Change a field in the schema and the template's columns change with it.

#### Sample template

A template for annotator `joe` coding one field, `TUTOR_MOVE`, with **2 slots** looks like this:

| session_id | sequence_id | role    | content                                        | annotator[joe][0]TUTOR_MOVE | annotator[joe][1]TUTOR_MOVE |
| ---------- | ----------- | ------- | ---------------------------------------------- | --------------------------- | --------------------------- |
| sess_001   | 0           | Tutor   | Let's pick up where we left off on question 3. | MANAGING                    |                             |
| sess_001   | 1           | Student | Okay… I don't really get part b.               |                             |                             |
| sess_001   | 2           | Tutor   | What do you notice about the denominator here? | PROBING_UNDERSTAND          | GIVING_HINT                 |
| sess_001   | 3           | Student | Oh — they have to match first.                 |                             |                             |

- `session_id`, `sequence_id`, `role`, and `content` are pre-filled by the template — leave them unchanged so each row still matches the run set.
- Fill the `annotator[...]` columns with codes from that field's schema; leave a cell blank when no code applies.
- Here `joe` gives one utterance two codes (`PROBING_UNDERSTAND` + `GIVING_HINT`) using slots `0` and `1`; every other row uses only slot `0`.
- Adding a second annotator (`josephine`) would add a parallel set of columns: `annotator[josephine][0]TUTOR_MOVE`, etc. — and create a second Human Run.

### Per-session human runs

When the run set's annotation type is **[Per session](perSession)**, coding happens at the level of the whole session, not each utterance. The template reflects this: it has **one row per session** and only two context columns.

| Column       | Meaning                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `session_id` | the session identifier                                                                                                        |
| `content`    | the full transcript of that session (each line `role: content`), included read-only so you can code without leaving the sheet |

The `annotator[<name>][<slot>]<fieldKey>` columns work exactly as they do per-utterance. Enter one value per session in slot `0`; use extra slots only when a session can carry more than one value for a field.

On upload, these are stored as **session-level annotations** — the same shape an LLM per-session run produces — so a per-session human run lines up correctly against LLM runs in an evaluation. (A per-session template has no `sequence_id` or per-utterance `role`/`content` columns.)

### Annotating the CSV

1.  **Fill in Labels:** Open the CSV in a spreadsheet editor and fill in the annotator columns with your human labels.
2.  **Multiple Annotators:** Each unique annotator name in the column headers becomes its own human run. Sandpiper detects annotators automatically from the `annotator[<name>][<slot>]<field>` format.
3.  **Match Schema Codes:** Each column's `<fieldKey>` corresponds to a field in your **[Prompt Schema](schema)**, and the values you enter should match that field's codes (e.g., `PRAISE`, `NOT_PRAISE`). Sandpiper accepts any string value, but codes that don't match the schema won't align with LLM runs during evaluation.

### Boolean and typed fields

Schema fields have a **type** — string, number, or boolean (see **[Schema](schema)**). Code each value to match its field's type so it imports as a real value rather than plain text:

- **Boolean fields:** enter `TRUE` or `FALSE`. Case does not matter, and `true`/`false`, `1`/`0`, and `yes`/`no` are also accepted — so a spreadsheet checkbox that exports as `TRUE`/`FALSE` works as-is. On import these become real booleans, so they display as a **checkbox** (just like LLM boolean annotations) and compare correctly against LLM values in an evaluation.
- **Number fields:** enter a plain number such as `4`; it imports as a number.
- **String / coded fields:** enter the schema code, e.g. `PRAISE`.

Sandpiper reads each field's type from the LLM runs already in the run set (the same runs whose fields the template offers). If a field has no typed LLM run to learn from, its values are kept as text.

> **Coded a run before this was supported?** Human runs uploaded before typed import was added stored booleans as the literal text `"TRUE"`/`"FALSE"`, which do **not** match LLM booleans and make agreement scores in their evaluations untrustworthy. Existing runs are **not** converted automatically — re-download the template and re-upload those runs to fix their metrics.

### Uploading the CSV

1.  **Open the Upload Dialog:** From the **Run Set** dropdown menu, click **"Upload Human Annotations"**.
2.  **Select the CSV:** Choose your completed CSV file. Sandpiper analyzes it and displays a validation summary:
    - **Annotators** — the annotators detected from column headers, and how many runs will be created
    - **Annotation Fields** — the fields that will be imported
    - **Matched sessions** — sessions in the CSV that match a session in the run set
    - **Unmatched sessions** — session IDs in the CSV that don't match any run set session
    - **Missing sessions** — sessions in the run set that aren't covered by the CSV
3.  **Confirm Upload:** Review the analysis results and confirm the upload to create the human runs.
4.  **Processing:** Sandpiper processes the annotations in the background and adds the human runs to the run set. Each human annotation is stored with `identifiedBy: "HUMAN"` to distinguish it from LLM-generated annotations.

### Using Human Runs in Evaluations

Once human runs are added to a run set:

1.  **Create an Evaluation:** From the **Evaluation** tab, create a new evaluation that includes both human and LLM runs.
2.  **Set Human Run as Base:** Select a human run as the **Base Run** to calculate accuracy metrics (Precision, Recall, F1) for all other runs.
3.  **Compare Results:** The evaluation will show agreement scores between all run pairs, with human labels serving as ground truth.

## Related Concepts

- **[Run Sets](run-sets)** — Where human annotations are uploaded and compared
- **[Runs](runs)** — Human runs appear alongside LLM runs
- **[Evaluation Equations](evaluation-equations)** — The metrics used to compare runs
- **[Schema](schema)** — Defines the annotation fields (`fieldKey` and codes) used in the template
- **[Adjudication](adjudication)** — Resolve disagreements after human/LLM comparison
