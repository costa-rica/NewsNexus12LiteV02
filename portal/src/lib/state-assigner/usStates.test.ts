import { describe, expect, it } from "vitest";

import { normalizeUsState, US_STATES } from "./usStates";

describe("normalizeUsState", () => {
  it("matches full state names", () => {
    expect(normalizeUsState("california")).toBe("California");
    expect(normalizeUsState(" New York ")).toBe("New York");
  });

  it("matches abbreviations", () => {
    expect(normalizeUsState("CA")).toBe("California");
    expect(normalizeUsState("dc")).toBe("District of Columbia");
  });

  it("checks names before abbreviations", () => {
    expect(normalizeUsState("District of Columbia")).toBe(
      "District of Columbia",
    );
  });

  it("returns an empty string for unknown values", () => {
    expect(normalizeUsState("Atlantis")).toBe("");
    expect(normalizeUsState("")).toBe("");
    expect(normalizeUsState(undefined)).toBe("");
  });

  it("contains 50 states plus DC", () => {
    expect(US_STATES).toHaveLength(51);
  });
});
