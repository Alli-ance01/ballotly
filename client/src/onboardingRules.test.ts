import { describe, expect, it } from "vitest";
import { organizationWorkspaceLocation, parseWorkspaceSearch, workspaceLocationForNewOrganization } from "./onboardingRules";

describe("Ballotly first-workspace onboarding", () => {
  it("opens the election-board setup step immediately after organization creation", () => {
    expect(workspaceLocationForNewOrganization("org_123")).toBe("/workspace?org=org_123&newElection=1");
  });

  it("keeps existing organization navigation free of onboarding state", () => {
    expect(organizationWorkspaceLocation("org_123")).toBe("/workspace?org=org_123");
  });

  it("reads organization and first-board state from Wouter's reactive query string", () => {
    expect(parseWorkspaceSearch("?org=org_123&newElection=1")).toEqual({ organizationId: "org_123", shouldOpenBoardSetup: true });
  });
});
