import { describe, expect, it } from "vitest";

import { parseStateAssignment } from "./parse";

function completion(content: unknown) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

describe("parseStateAssignment", () => {
  it("returns failed when content is missing", () => {
    expect(parseStateAssignment({ choices: [] })).toMatchObject({
      resultStatus: "failed",
    });
  });

  it("returns failed for malformed JSON", () => {
    expect(parseStateAssignment(completion("{not json"))).toMatchObject({
      resultStatus: "failed",
    });
  });

  it("tolerates one surrounding markdown code fence", () => {
    expect(
      parseStateAssignment(
        completion(`\`\`\`json
{"occuredInTheUS":true,"reasoning":"The article names Seattle.","state":"Washington"}
\`\`\``),
      ),
    ).toMatchObject({
      resultStatus: "assigned",
      stateName: "Washington",
    });
  });

  it("returns failed when required fields are missing", () => {
    expect(
      parseStateAssignment(
        completion(JSON.stringify({ occuredInTheUS: true, state: "CA" })),
      ),
    ).toMatchObject({
      resultStatus: "failed",
    });
  });

  it("returns no_state when the article did not occur in the United States", () => {
    expect(
      parseStateAssignment(
        completion(
          JSON.stringify({
            occuredInTheUS: false,
            reasoning: "The article describes events in Canada.",
          }),
        ),
      ),
    ).toMatchObject({
      occuredInTheUS: false,
      reasoning: "The article describes events in Canada.",
      stateName: "",
      resultStatus: "no_state",
    });
  });

  it("returns assigned for full state names", () => {
    expect(
      parseStateAssignment(
        completion(
          JSON.stringify({
            occuredInTheUS: true,
            reasoning: "The article names Los Angeles.",
            state: "California",
          }),
        ),
      ),
    ).toMatchObject({
      occuredInTheUS: true,
      reasoning: "The article names Los Angeles.",
      stateName: "California",
      rawStateText: "California",
      resultStatus: "assigned",
    });
  });

  it("normalizes state abbreviations", () => {
    expect(
      parseStateAssignment(
        completion(
          JSON.stringify({
            occuredInTheUS: true,
            reasoning: "The article names Miami.",
            state: "FL",
          }),
        ),
      ),
    ).toMatchObject({
      stateName: "Florida",
      rawStateText: "FL",
      resultStatus: "assigned",
    });
  });

  it("returns no_state and preserves unknown raw state text", () => {
    expect(
      parseStateAssignment(
        completion(
          JSON.stringify({
            occuredInTheUS: true,
            reasoning: "The article claims an unknown state.",
            state: "Atlantis",
          }),
        ),
      ),
    ).toMatchObject({
      stateName: "",
      rawStateText: "Atlantis",
      resultStatus: "no_state",
    });
  });

  it("returns no_state and preserves blank raw state text", () => {
    expect(
      parseStateAssignment(
        completion(
          JSON.stringify({
            occuredInTheUS: true,
            reasoning: "No state is supported.",
            state: "   ",
          }),
        ),
      ),
    ).toMatchObject({
      stateName: "",
      rawStateText: "",
      resultStatus: "no_state",
    });
  });
});
