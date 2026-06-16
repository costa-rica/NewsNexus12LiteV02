import type {
  Article,
  FlowState,
  LocationRunStatus,
  LocationScore,
  ScrapeResult,
  ScrapeRunStatus,
  StageKey,
} from "./types";

export type FlowAction =
  | { type: "setStage"; stage: StageKey }
  | { type: "setArticles"; articles: Article[] }
  | { type: "setScrapeRun"; scrapeRun: ScrapeRunStatus }
  | { type: "applyScrapeResults"; results: ScrapeResult[] }
  | { type: "setLocationRun"; locationRun: LocationRunStatus }
  | { type: "applyLocationRatings"; scores: LocationScore[]; skippedIds: string[] }
  | { type: "resetFlow" };

export function createInitialFlowState(): FlowState {
  return {
    currentStage: "search",
    articles: [],
  };
}

export const initialFlowState = createInitialFlowState();

export function setStage(stage: StageKey): FlowAction {
  return { type: "setStage", stage };
}

export function setArticles(articles: Article[]): FlowAction {
  return { type: "setArticles", articles };
}

export function setScrapeRun(scrapeRun: ScrapeRunStatus): FlowAction {
  return { type: "setScrapeRun", scrapeRun };
}

export function applyScrapeResults(results: ScrapeResult[]): FlowAction {
  return { type: "applyScrapeResults", results };
}

export function setLocationRun(locationRun: LocationRunStatus): FlowAction {
  return { type: "setLocationRun", locationRun };
}

export function applyLocationRatings(
  scores: LocationScore[],
  skippedIds: string[],
): FlowAction {
  return { type: "applyLocationRatings", scores, skippedIds };
}

export function resetFlow(): FlowAction {
  return { type: "resetFlow" };
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "setStage":
      return {
        ...state,
        currentStage: action.stage,
      };
    case "setArticles":
      return {
        ...state,
        articles: action.articles,
        scrapeRun: undefined,
        locationRun: undefined,
      };
    case "setScrapeRun":
      return {
        ...state,
        scrapeRun: action.scrapeRun,
      };
    case "applyScrapeResults": {
      const resultsById = new Map(
        action.results
          .filter((result): result is ScrapeResult & { articleId: string } =>
            Boolean(result.articleId),
          )
          .map((result) => [result.articleId, result]),
      );

      return {
        ...state,
        articles: state.articles.map((article) => {
          const result = resultsById.get(article.id);

          if (!result) {
            return article;
          }

          return {
            ...article,
            scrape: {
              ...article.scrape,
              ...result,
            },
          };
        }),
      };
    }
    case "setLocationRun":
      return {
        ...state,
        locationRun: action.locationRun,
      };
    case "applyLocationRatings": {
      const scoreById = new Map(
        action.scores.map((score) => [score.article_id, score.score]),
      );
      const skipped = new Set(action.skippedIds);

      return {
        ...state,
        articles: state.articles.map((article) => {
          if (scoreById.has(article.id)) {
            return { ...article, locationRating: scoreById.get(article.id) ?? null };
          }
          if (skipped.has(article.id)) {
            return { ...article, locationRating: null };
          }
          return article;
        }),
      };
    }
    case "resetFlow":
      return createInitialFlowState();
    default:
      return state;
  }
}
