import { describe, expect, it } from "vitest";
import { organizationWorkspaceLocation, workspaceLocationForNewOrganization } from "./onboardingRules";

describe("Ballotly first-workspace onboarding", () => {
  it("opens the election-board setup step immediately after organization creation", () => {
    expect(workspaceLocationForNewOrganization("org_123")).toBe("/workspace?org=org_123&newElection=1");
  });

  it("keeps existing organization navigation free of onboarding state", () => {
    expect(organizationWorkspaceLocation("org_123")).toBe("/workspace?org=org_123");
  });
});
