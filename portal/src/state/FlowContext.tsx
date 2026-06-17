"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";

import {
  createInitialFlowState,
  flowReducer,
  type FlowAction,
} from "./flowReducer";
import type { FlowState } from "./types";

interface FlowContextValue {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

const FlowContext = createContext<FlowContextValue | undefined>(undefined);

interface FlowProviderProps {
  children: ReactNode;
  initialState?: FlowState;
}

export function FlowProvider({ children, initialState }: FlowProviderProps) {
  const [state, dispatch] = useReducer(
    flowReducer,
    initialState ?? createInitialFlowState(),
  );

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow() {
  const context = useContext(FlowContext);

  if (!context) {
    throw new Error("useFlow must be used inside FlowProvider");
  }

  return context;
}
