export function workspaceLocationForNewOrganization(organizationId: string) {
  return `/workspace?org=${organizationId}&newElection=1`;
}

export function organizationWorkspaceLocation(organizationId: string) {
  return `/workspace?org=${organizationId}`;
}
