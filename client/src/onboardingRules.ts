export function workspaceLocationForNewOrganization(organizationId: string) {
  return `/workspace?org=${organizationId}&newElection=1`;
}

export function organizationWorkspaceLocation(organizationId: string) {
  return `/workspace?org=${organizationId}`;
}

export function parseWorkspaceSearch(search: string) {
  const params = new URLSearchParams(search);
  return {
    organizationId: params.get("org") ?? "",
    shouldOpenBoardSetup: params.get("newElection") === "1",
  };
}
