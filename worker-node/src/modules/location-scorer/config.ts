export interface LocationScorerConfig {
  model: string;
  dtype: LocationScorerDtype;
}

export type LocationScorerDtype =
  | "auto"
  | "fp32"
  | "fp16"
  | "q8"
  | "int8"
  | "uint8"
  | "q4"
  | "bnb4"
  | "q4f16";

const DEFAULT_MODEL = "Xenova/bart-large-mnli";
const DEFAULT_DTYPE: LocationScorerDtype = "q8";
const LOCATION_SCORER_DTYPES = new Set<LocationScorerDtype>([
  "auto",
  "fp32",
  "fp16",
  "q8",
  "int8",
  "uint8",
  "q4",
  "bnb4",
  "q4f16",
]);

export function loadLocationScorerConfig(
  env: NodeJS.ProcessEnv = process.env,
): LocationScorerConfig {
  const model = env.LOCATION_SCORER_MODEL?.trim();
  const dtype = env.LOCATION_SCORER_DTYPE?.trim();

  return {
    model: model && model.length > 0 ? model : DEFAULT_MODEL,
    dtype: isLocationScorerDtype(dtype) ? dtype : DEFAULT_DTYPE,
  };
}

function isLocationScorerDtype(
  value: string | undefined,
): value is LocationScorerDtype {
  return !!value && LOCATION_SCORER_DTYPES.has(value as LocationScorerDtype);
}
