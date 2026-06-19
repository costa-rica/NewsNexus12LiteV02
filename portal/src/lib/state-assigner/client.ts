import type { StateAssignment } from "@/state/types";

export interface AssignArticleStateArgs {
  promptTemplate: string;
  title: string;
  content: string;
}

export class StateAssignmentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StateAssignmentRequestError";
  }
}

export async function assignArticleState(
  args: AssignArticleStateArgs,
  signal?: AbortSignal,
): Promise<StateAssignment> {
  const response = await fetch("/api/state-assigner/assign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as
    | StateAssignment
    | { error?: { code?: string; message?: string } };

  if (!response.ok) {
    const envelope = (data as { error?: { code?: string; message?: string } })
      .error;
    const message =
      typeof envelope?.message === "string"
        ? envelope.message
        : "State assignment request failed.";
    const code = typeof envelope?.code === "string" ? envelope.code : undefined;

    throw new StateAssignmentRequestError(message, response.status, code);
  }

  return data as StateAssignment;
}
