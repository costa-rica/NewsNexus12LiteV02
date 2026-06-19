import { NextResponse } from "next/server";

import { errorJson } from "@/lib/http/errors";
import { failedAssignment, parseStateAssignment } from "@/lib/state-assigner/parse";
import { buildPrompt } from "@/lib/state-assigner/prompt";
import { logInfo, logWarn } from "@/lib/serverLogger";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 10_000;

interface StateAssignRequestBody {
  promptTemplate?: unknown;
  title?: unknown;
  content?: unknown;
}

export async function POST(request: Request) {
  const apiKey = process.env.KEY_OPEN_AI?.trim();

  if (!apiKey) {
    return errorJson({
      code: "SERVICE_UNAVAILABLE",
      message: "State assignment is not configured.",
      status: 503,
      logMeta: {
        route: "state-assigner.assign",
        failure: "missing_openai_key",
      },
    });
  }

  const body = await readBody(request);
  const validationError = validateBody(body);

  if (validationError) {
    return validationError;
  }

  const promptTemplate = String(body.promptTemplate).trim();
  const title = String(body.title).trim();
  const content = String(body.content).trim();

  if (!title && !content) {
    logWarn("state assignment skipped article with no usable text", {
      route: "state-assigner.assign",
      failure: "empty_article_text",
    });

    return NextResponse.json(
      failedAssignment("No usable article text to assign a state."),
    );
  }

  const prompt = buildPrompt(promptTemplate, { title, content });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    logInfo("state assignment openai request started", {
      route: "state-assigner.assign",
      titleLength: title.length,
      contentLength: content.length,
    });

    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logWarn("state assignment openai request failed", {
        route: "state-assigner.assign",
        failure: "openai_non_2xx",
        status: response.status,
      });

      return NextResponse.json(
        failedAssignment("State assignment provider returned an error."),
      );
    }

    const data = (await response.json().catch(() => null)) as unknown;
    const assignment = parseStateAssignment(data);

    logInfo("state assignment parsed", {
      route: "state-assigner.assign",
      resultStatus: assignment.resultStatus,
    });

    return NextResponse.json(assignment);
  } catch (error) {
    const failure = isAbortError(error) ? "timeout" : "request_failed";
    logWarn("state assignment openai request failed", {
      route: "state-assigner.assign",
      failure,
    });

    return NextResponse.json(
      failedAssignment(
        failure === "timeout"
          ? "State assignment timed out."
          : "State assignment request failed.",
      ),
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readBody(request: Request): Promise<StateAssignRequestBody> {
  try {
    return (await request.json()) as StateAssignRequestBody;
  } catch {
    return {};
  }
}

function validateBody(body: StateAssignRequestBody) {
  if (typeof body.promptTemplate !== "string" || !body.promptTemplate.trim()) {
    return errorJson({
      code: "VALIDATION_ERROR",
      message: "Prompt template is required.",
      status: 400,
      logMeta: {
        route: "state-assigner.assign",
        failure: "missing_prompt_template",
      },
    });
  }

  if (typeof body.title !== "string" || typeof body.content !== "string") {
    return errorJson({
      code: "VALIDATION_ERROR",
      message: "Article title and content are required.",
      status: 400,
      logMeta: {
        route: "state-assigner.assign",
        failure: "invalid_article_fields",
      },
    });
  }

  return null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
