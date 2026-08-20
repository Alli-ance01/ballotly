import type { OrganizationRole } from "./types";

export function canManageOrganization(role: OrganizationRole | undefined | null) {
  return role === "owner" || role === "admin";
}

export function canAssignOrganizationRoles(role: OrganizationRole | undefined | null) {
  return role === "owner";
}

export function belongsToTenant(requestedOrganizationId: string, resourceOrganizationId: string) {
  return requestedOrganizationId === resourceOrganizationId;
}
