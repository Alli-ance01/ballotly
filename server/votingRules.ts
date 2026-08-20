import type { ElectionStatus } from "./types";

export const electionStatuses = ["draft", "scheduled", "open", "closed", "archived"] as const;

const allowedTransitions: Record<ElectionStatus, readonly ElectionStatus[]> = {
  draft: ["scheduled", "open", "archived"],
  scheduled: ["draft", "open", "archived"],
  open: ["closed"],
  closed: ["archived"],
  archived: [],
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function canTransitionElection(currentStatus: ElectionStatus, nextStatus: ElectionStatus) {
  return currentStatus === nextStatus || allowedTransitions[currentStatus].includes(nextStatus);
}

export function assertElectionTransition(currentStatus: ElectionStatus, nextStatus: ElectionStatus) {
  if (!canTransitionElection(currentStatus, nextStatus)) {
    throw new Error(`An election cannot move from ${currentStatus} to ${nextStatus}.`);
  }
}

export function canChangeBallotMode(status: ElectionStatus, enrolledVoterCount: number) {
  return status === "draft" && enrolledVoterCount === 0;
}

export function isElectionOpen(
  election: { status: ElectionStatus; opensAt?: Date | null; closesAt?: Date | null },
  now = new Date(),
) {
  return election.status === "open" &&
    (!election.opensAt || election.opensAt.getTime() <= now.getTime()) &&
    (!election.closesAt || election.closesAt.getTime() > now.getTime());
}

export function assertVoteEligibility(input: {
  election: { status: ElectionStatus; opensAt?: Date | null; closesAt?: Date | null };
  eligibilityFound: boolean;
  alreadyVoted: boolean;
  now?: Date;
}) {
  if (!input.eligibilityFound) throw new Error("You are not enrolled as a voter for this election.");
  if (input.alreadyVoted) throw new Error("A ballot has already been submitted for this election.");
  if (!isElectionOpen(input.election, input.now)) throw new Error("This election is not currently open for voting.");
}
