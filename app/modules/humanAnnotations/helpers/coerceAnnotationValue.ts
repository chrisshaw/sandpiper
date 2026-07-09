const TRUE_VALUES = new Set(["true", "1", "yes", "y"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n"]);

// Human coders enter values as text (a spreadsheet exports a checkbox as "TRUE").
// AI runs store native booleans/numbers, and evaluations compare via String(value),
// so an uncoerced "TRUE" never matches an AI true. Coerce to the field's declared
// type; leave unrecognized values untouched so nothing is silently lost.
export default function coerceAnnotationValue(
  raw: string,
  fieldType?: string,
): string | number | boolean {
  if (fieldType === "boolean") {
    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return raw;
  }

  if (fieldType === "number") {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(parsed)) return parsed;
    return raw;
  }

  return raw;
}
