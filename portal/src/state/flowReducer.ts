import type {
  Article,
  FlowState,
  ScrapeResult,
  ScrapeRunStatus,
  StageKey,
} from "./types";

export type FlowAction =
  | { type: "setStage"; stage: StageKey }
  | { type: "setArticles"; articles: Article[] }
  | { type: "setScrapeRun"; scrapeRun: ScrapeRunStatus }
  | { type: "applyScrapeResults"; results: ScrapeResult[] }
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
    case "resetFlow":
      return createInitialFlowState();
    default:
      return state;
  }
}
