import type { StateAssignment } from "@/state/types";

import { normalizeUsState } from "./usStates";

interface OpenAiCompletion {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

interface ParsedStateResponse {
  occuredInTheUS?: unknown;
  reasoning?: unknown;
  state?: unknown;
  stateName?: unknown;
}

export function parseStateAssignment(completion: unknown): StateAssignment {
  const content = (completion as OpenAiCompletion)?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    return failedAssignment("Missing OpenAI response content.");
  }

  const parsed = parseJsonObject(stripSingleCodeFence(content));

  if (!parsed) {
    return failedAssignment("OpenAI response was not valid JSON.");
  }

  if (
    typeof parsed.occuredInTheUS !== "boolean" ||
    typeof parsed.reasoning !== "string" ||
    parsed.reasoning.trim().length === 0
  ) {
    return failedAssignment("OpenAI response missed required state fields.");
  }

  const reasoning = parsed.reasoning.trim();

  if (!parsed.occuredInTheUS) {
    return {
      occuredInTheUS: false,
      reasoning,
      stateName: "",
      resultStatus: "no_state",
    };
  }

  const rawStateText = readRawState(parsed);
  const stateName = normalizeUsState(rawStateText);

  if (!stateName) {
    return {
      occuredInTheUS: true,
      reasoning,
      stateName: "",
      rawStateText,
      resultStatus: "no_state",
    };
  }

  return {
    occuredInTheUS: true,
    reasoning,
    stateName,
    rawStateText,
    resultStatus: "assigned",
  };
}

export function failedAssignment(errorMessage: string): StateAssignment {
  return {
    resultStatus: "failed",
    errorMessage,
  };
}

function stripSingleCodeFence(content: string) {
  const trimmed = content.trim();
  const fenced = /^```(?:json|md)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);

  return fenced?.[1]?.trim() ?? trimmed;
}

function parseJsonObject(content: string): ParsedStateResponse | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    return parsed && typeof parsed === "object"
      ? (parsed as ParsedStateResponse)
      : null;
  } catch {
    return null;
  }
}

function readRawState(parsed: ParsedStateResponse) {
  const value = parsed.state ?? parsed.stateName;

  return typeof value === "string" ? value.trim() : undefined;
}
