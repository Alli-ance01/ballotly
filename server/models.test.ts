import { describe, expect, it } from "vitest";
import { BallotModel, ElectionModel, OrganizationModel } from "./models";

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
});
