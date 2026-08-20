import { describe, expect, it } from "vitest";
import { belongsToTenant, canAssignOrganizationRoles, canManageOrganization } from "./authorizationRules";

describe("Ballotly organization authorization rules", () => {
  it("allows only owners and administrators to manage an organization", () => {
    expect(canManageOrganization("owner")).toBe(true);
    expect(canManageOrganization("admin")).toBe(true);
    expect(canManageOrganization("member")).toBe(false);
  });

  it("reserves role assignment for organization owners", () => {
    expect(canAssignOrganizationRoles("owner")).toBe(true);
    expect(canAssignOrganizationRoles("admin")).toBe(false);
  });

  it("rejects cross-tenant resource access", () => {
    expect(belongsToTenant("organization-a", "organization-a")).toBe(true);
    expect(belongsToTenant("organization-a", "organization-b")).toBe(false);
  });
});
