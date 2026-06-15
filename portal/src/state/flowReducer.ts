import type { Article, FlowState, StageKey } from "./types";

export type FlowAction =
  | { type: "setStage"; stage: StageKey }
  | { type: "setArticles"; articles: Article[] }
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
      };
    case "resetFlow":
      return createInitialFlowState();
    default:
      return state;
  }
}
