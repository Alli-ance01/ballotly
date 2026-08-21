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

export function assertElectionReadyForLaunch(input: { candidateCount: number; voterCount: number; status: ElectionStatus; opensAt?: Date | null; now?: Date }) {
  if (input.candidateCount < 2) throw new Error("Add at least two candidates before opening an election.");
  if (input.voterCount < 1) throw new Error("Enroll at least one voter before opening an election.");
  if (input.status === "scheduled" && input.opensAt && input.opensAt.getTime() > (input.now ?? new Date()).getTime()) {
    throw new Error("This election is scheduled to open later. Update its schedule before opening it early.");
  }
}

export function parseVoterRoster(raw: string) {
  const seen = new Set<string>();
  const accepted: Array<{ email: string; displayName?: string }> = [];
  const rejected: Array<{ line: number; value: string; reason: string }> = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const value = line.trim();
    if (!value || /^email\s*(,|$)/i.test(value)) return;
    const [emailCell, ...nameCells] = value.split(",");
    const email = normalizeEmail(emailCell ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rejected.push({ line: index + 1, value, reason: "Enter one valid email address per line." });
      return;
    }
    if (seen.has(email)) {
      rejected.push({ line: index + 1, value, reason: "This email appears more than once." });
      return;
    }
    seen.add(email);
    const displayName = nameCells.join(",").trim();
    accepted.push({ email, ...(displayName ? { displayName: displayName.slice(0, 160) } : {}) });
  });
  return { accepted, rejected };
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
