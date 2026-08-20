import { describe, expect, it } from "vitest";
import {
  assertElectionTransition,
  assertVoteEligibility,
  canChangeBallotMode,
  canTransitionElection,
  isElectionOpen,
  normalizeEmail,
} from "./votingRules";

describe("Ballotly election safeguards", () => {
  it("allows only intentional election lifecycle transitions", () => {
    expect(canTransitionElection("draft", "scheduled")).toBe(true);
    expect(canTransitionElection("open", "draft")).toBe(false);
    expect(() => assertElectionTransition("closed", "open")).toThrow(/cannot move/);
  });

  it("locks the ballot privacy model once enrollment begins or the election leaves draft", () => {
    expect(canChangeBallotMode("draft", 0)).toBe(true);
    expect(canChangeBallotMode("draft", 1)).toBe(false);
    expect(canChangeBallotMode("scheduled", 0)).toBe(false);
    expect(canChangeBallotMode("open", 0)).toBe(false);
  });

  it("accepts ballots only while voting is actively open", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    expect(isElectionOpen({ status: "open", opensAt: new Date("2026-08-20T11:00:00.000Z"), closesAt: new Date("2026-08-20T13:00:00.000Z") }, now)).toBe(true);
    expect(isElectionOpen({ status: "open", closesAt: new Date("2026-08-20T11:59:59.000Z") }, now)).toBe(false);
    expect(() => assertVoteEligibility({ election: { status: "open" }, eligibilityFound: true, alreadyVoted: true })).toThrow(/already been submitted/);
  });

  it("normalizes the voter identity used for email eligibility lookup", () => {
    expect(normalizeEmail("  MEMBER@Example.org ")).toBe("member@example.org");
  });
});
