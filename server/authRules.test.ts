import { describe, expect, it } from "vitest";
import { assertPasswordPolicy, normalizeAccountEmail } from "./authRules";

describe("Ballotly native account rules", () => {
  it("requires a password length compatible with secure bcrypt hashing", () => {
    expect(() => assertPasswordPolicy("shorty")).toThrow(/at least 12/);
    expect(() => assertPasswordPolicy("a".repeat(73))).toThrow(/no more than 72/);
    expect(() => assertPasswordPolicy("ballotly-is-better-than-a-poll")).not.toThrow();
  });

  it("normalizes account email addresses before lookup and registration", () => {
    expect(normalizeAccountEmail("  MEMBER@Example.org ")).toBe("member@example.org");
  });
});
