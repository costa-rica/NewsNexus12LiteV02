export interface LocationScorerConfig {
  model: string;
}

const DEFAULT_MODEL = "Xenova/bart-large-mnli";

export function loadLocationScorerConfig(
  env: NodeJS.ProcessEnv = process.env,
): LocationScorerConfig {
  const model = env.LOCATION_SCORER_MODEL?.trim();
  return { model: model && model.length > 0 ? model : DEFAULT_MODEL };
}
