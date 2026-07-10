import type { AnnotationSchemaItem } from "~/modules/prompts/prompts.types";
import { RunService } from "~/modules/runs/run";
import type { RunSet } from "~/modules/runSets/runSets.types";
import buildTypedAnnotationSchemaFromHeaders from "../helpers/buildTypedAnnotationSchemaFromHeaders";
import getAnnotationFieldTypesFromRuns from "../helpers/getAnnotationFieldTypesFromRuns";

// Fork-only. Recovers each field's type from the run set's existing runs so
// the human run's schema snapshot records it and imported values can be
// coerced (e.g. "TRUE" -> boolean true). Falls back to upstream's untyped
// string schema when no typed run exists.
export default async function buildAnnotationSchemaForRunSet(
  runSet: RunSet,
  headers: string[],
): Promise<AnnotationSchemaItem[]> {
  const runs = await RunService.find({
    match: { _id: { $in: runSet.runs ?? [] } },
  });

  const fieldTypes = getAnnotationFieldTypesFromRuns(runs);

  return buildTypedAnnotationSchemaFromHeaders(headers, fieldTypes);
}
