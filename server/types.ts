export type PlatformRole = "user" | "admin";
export type OrganizationRole = "owner" | "admin" | "member";
export type ElectionStatus = "draft" | "scheduled" | "open" | "closed" | "archived";
export type BallotMode = "anonymous" | "attributable";
export type ResultsVisibility = "after_close" | "always" | "admins_only";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type AppUser = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: PlatformRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
};

export type OrganizationView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ElectionView = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  description: string | null;
  ballotPrompt: string;
  status: ElectionStatus;
  ballotMode: BallotMode;
  resultsVisibility: ResultsVisibility;
  opensAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
