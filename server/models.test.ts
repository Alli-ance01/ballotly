import { describe, expect, it } from "vitest";
import { BallotModel, ElectionModel, OrganizationModel, VoterEligibilityModel } from "./models";

describe("Ballotly MongoDB models", () => {
  it("defines a first-class ballot record scoped to an election and organization", () => {
    expect(BallotModel.modelName).toBe("Ballot");
    expect(BallotModel.schema.path("organizationId")).toBeDefined();
    expect(BallotModel.schema.path("electionId")).toBeDefined();
    expect(BallotModel.schema.path("prompt")).toBeDefined();
    expect(BallotModel.schema.path("mode")).toBeDefined();
  });

  it("keeps election and organization records as separate tenancy roots", () => {
    expect(ElectionModel.modelName).toBe("Election");
    expect(OrganizationModel.modelName).toBe("Organization");
  });

  it("persists voter invitation state and expiry for controlled eligibility activation", () => {
    expect(VoterEligibilityModel.schema.path("invitationStatus")).toBeDefined();
    expect(VoterEligibilityModel.schema.path("invitationExpiresAt")).toBeDefined();
    expect((VoterEligibilityModel.schema.path("invitationStatus") as any).enumValues).toEqual(expect.arrayContaining(["pending", "accepted", "revoked", "expired"]));
  });
});
