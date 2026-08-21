import mongoose from "mongoose";
import {
  AuditEventModel,
  BallotModel,
  CandidateModel,
  connectMongo,
  ElectionModel,
  LoginAttemptModel,
  MembershipModel,
  OrganizationInvitationModel,
  OrganizationModel,
  UserModel,
  VoterEligibilityModel,
  VoteModel,
} from "./models";
import type {
  AppUser,
  BallotMode,
  ElectionStatus,
  ElectionView,
  OrganizationRole,
  OrganizationView,
  ResultsVisibility,
} from "./types";
import { normalizeEmail } from "./votingRules";
import { ENV } from "./_core/env";

const asId = (value: unknown) => String(value);

function asUser(record: any): AppUser {
  return {
    id: asId(record._id),
    openId: record.openId,
    name: record.name ?? null,
    email: record.email ?? null,
    loginMethod: record.loginMethod ?? null,
    role: record.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSignedIn: record.lastSignedIn,
    emailVerifiedAt: record.emailVerifiedAt ?? null,
    sessionVersion: record.sessionVersion ?? 0,
  };
}

function asOrganization(record: any): OrganizationView {
  return {
    id: asId(record._id),
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    createdByUserId: asId(record.createdByUserId),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function asElection(record: any): ElectionView {
  return {
    id: asId(record._id),
    organizationId: asId(record.organizationId),
    createdByUserId: asId(record.createdByUserId),
    title: record.title,
    description: record.description ?? null,
    ballotPrompt: record.ballotPrompt,
    status: record.status,
    ballotMode: record.ballotMode,
    resultsVisibility: record.resultsVisibility,
    opensAt: record.opensAt ?? null,
    closesAt: record.closesAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function objectId(id: string, label = "Record") {
  if (!mongoose.isValidObjectId(id)) throw new Error(`${label} identifier is invalid.`);
  return new mongoose.Types.ObjectId(id);
}

export async function getUserByOpenId(openId: string) {
  await connectMongo();
  const user = await UserModel.findOne({ openId }).lean();
  return user ? asUser(user) : undefined;
}

export async function getUserById(id: string) {
  await connectMongo();
  const user = await UserModel.findById(objectId(id, "User")).lean();
  return user ? asUser(user) : null;
}

export async function getUserWithPasswordByEmail(email: string) {
  await connectMongo();
  const record = await UserModel.findOne({ email }).select("+passwordHash").lean();
  if (!record) return null;
  return { user: asUser(record), passwordHash: record.passwordHash as string | null };
}

export async function registerNativeUser(input: { name: string; email: string; passwordHash: string }) {
  await connectMongo();
  const existing = await UserModel.exists({ email: input.email });
  if (existing) throw new Error("An account with that email already exists.");
  const openId = `ballotly_${new mongoose.Types.ObjectId().toString()}`;
  const user = await UserModel.create({
    openId,
    name: input.name,
    email: input.email,
    loginMethod: "password",
    passwordHash: input.passwordHash,
    role: "user",
    lastSignedIn: new Date(),
    sessionVersion: 0,
  });
  return asUser(user.toObject());
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

export async function isLoginTemporarilyBlocked(email: string) {
  await connectMongo();
  const attempt = await LoginAttemptModel.findOne({ email: normalizeEmail(email) }).lean();
  return Boolean(attempt?.blockedUntil && attempt.blockedUntil.getTime() > Date.now());
}

export async function recordLoginFailure(email: string) {
  await connectMongo();
  const normalized = normalizeEmail(email);
  const now = new Date();
  const attempt = await LoginAttemptModel.findOne({ email: normalized });
  const withinWindow = Boolean(attempt && now.getTime() - attempt.windowStartedAt.getTime() < LOGIN_FAILURE_WINDOW_MS);
  const failureCount = withinWindow ? (attempt?.failureCount ?? 0) + 1 : 1;
  const blockedUntil = failureCount >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_FAILURE_WINDOW_MS) : null;
  await LoginAttemptModel.findOneAndUpdate(
    { email: normalized },
    { $set: { failureCount, windowStartedAt: withinWindow ? attempt!.windowStartedAt : now, blockedUntil } },
    { upsert: true },
  );
}

export async function clearLoginFailures(email: string) {
  await connectMongo();
  await LoginAttemptModel.deleteOne({ email: normalizeEmail(email) });
}

export async function changeNativeUserPassword(input: { userId: string; passwordHash: string }) {
  await connectMongo();
  const user = await UserModel.findByIdAndUpdate(
    objectId(input.userId, "User"),
    { $set: { passwordHash: input.passwordHash, lastSignedIn: new Date() }, $inc: { sessionVersion: 1 } },
    { new: true },
  ).lean();
  if (!user) throw new Error("Account not found.");
  return asUser(user);
}

export async function acceptPendingOrganizationInvitations(user: AppUser) {
  if (!user.email) return 0;
  await connectMongo();
  const now = new Date();
  const email = normalizeEmail(user.email);
  await OrganizationInvitationModel.updateMany({ email, status: "pending", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const invitations = await OrganizationInvitationModel.find({ email, status: "pending", expiresAt: { $gt: now } });
  for (const invitation of invitations) {
    await MembershipModel.findOneAndUpdate(
      { organizationId: invitation.organizationId, userId: objectId(user.id, "User") },
      { $setOnInsert: { organizationId: invitation.organizationId, userId: objectId(user.id, "User"), role: invitation.role } },
      { upsert: true },
    );
    invitation.status = "accepted";
    invitation.acceptedByUserId = objectId(user.id, "User");
    await invitation.save();
  }
  return invitations.length;
}

export async function upsertUser(input: Omit<Partial<AppUser>, "id" | "createdAt" | "updatedAt"> & { openId: string }) {
  await connectMongo();
  const set: Record<string, unknown> = { lastSignedIn: input.lastSignedIn ?? new Date() };
  for (const field of ["name", "email", "loginMethod", "role"] as const) {
    if (input[field] !== undefined) set[field] = input[field];
  }
  if (input.openId === ENV.ownerOpenId) set.role = "admin";
  await UserModel.findOneAndUpdate({ openId: input.openId }, { $set: set, $setOnInsert: { openId: input.openId } }, { upsert: true, new: true });
}

export async function listOrganizationsForUser(userId: string) {
  await connectMongo();
  const memberships = await MembershipModel.find({ userId: objectId(userId, "User") }).sort({ updatedAt: -1 }).lean();
  const organizationIds = memberships.map(membership => membership.organizationId);
  const organizations = await OrganizationModel.find({ _id: { $in: organizationIds } }).sort({ updatedAt: -1 }).lean();
  const membershipByOrganization = new Map(memberships.map(item => [asId(item.organizationId), item]));
  return organizations.map(organization => ({
    organization: asOrganization(organization),
    membership: {
      id: asId(membershipByOrganization.get(asId(organization._id))?._id),
      role: membershipByOrganization.get(asId(organization._id))?.role as OrganizationRole,
    },
  }));
}

export async function listPlatformOrganizations() {
  await connectMongo();
  const organizations = await OrganizationModel.find().sort({ createdAt: -1 }).lean();
  return Promise.all(organizations.map(async organization => ({
    organization: asOrganization(organization),
    electionCount: await ElectionModel.countDocuments({ organizationId: organization._id }),
    memberCount: await MembershipModel.countDocuments({ organizationId: organization._id }),
  })));
}

export async function createOrganization(input: { name: string; slug: string; description?: string; createdByUserId: string }) {
  await connectMongo();
  const session = await mongoose.startSession();
  try {
    let created: any;
    await session.withTransaction(async () => {
      const [organization] = await OrganizationModel.create(
        [{ name: input.name, slug: input.slug, description: input.description || null, createdByUserId: objectId(input.createdByUserId, "User") }],
        { session },
      );
      await MembershipModel.create([{ organizationId: organization._id, userId: objectId(input.createdByUserId, "User"), role: "owner" }], { session });
      created = organization.toObject();
    });
    return asOrganization(created);
  } finally {
    await session.endSession();
  }
}

export async function getOrganizationAccess(organizationId: string, userId: string) {
  await connectMongo();
  const [organization, membership] = await Promise.all([
    OrganizationModel.findById(objectId(organizationId, "Organization")).lean(),
    MembershipModel.findOne({ organizationId: objectId(organizationId, "Organization"), userId: objectId(userId, "User") }).lean(),
  ]);
  if (!organization || !membership) return null;
  return {
    organization: asOrganization(organization),
    membership: { id: asId(membership._id), role: membership.role as OrganizationRole },
  };
}

export async function listOrganizationMembers(organizationId: string) {
  await connectMongo();
  const memberships = await MembershipModel.find({ organizationId: objectId(organizationId, "Organization") }).sort({ createdAt: 1 }).lean();
  const users = await UserModel.find({ _id: { $in: memberships.map(membership => membership.userId) } }).lean();
  const userById = new Map(users.map(user => [asId(user._id), user]));
  return memberships.map(membership => {
    const user = userById.get(asId(membership.userId));
    return { id: asId(membership._id), userId: asId(membership.userId), role: membership.role as OrganizationRole, name: user?.name ?? null, email: user?.email ?? null };
  });
}

export async function assignOrganizationRole(input: { organizationId: string; email: string; role: Exclude<OrganizationRole, "owner"> }) {
  await connectMongo();
  const user = await UserModel.findOne({ email: normalizeEmail(input.email) }).lean();
  if (!user) throw new Error("That person must sign in to Ballotly once before they can be added to this workspace.");
  const membership = await MembershipModel.findOneAndUpdate(
    { organizationId: objectId(input.organizationId, "Organization"), userId: user._id },
    { $set: { role: input.role }, $setOnInsert: { organizationId: objectId(input.organizationId, "Organization"), userId: user._id } },
    { upsert: true, new: true },
  ).lean();
  return { id: asId(membership!._id), userId: asId(user._id), role: membership!.role as OrganizationRole, name: user.name ?? null, email: user.email ?? null };
}

export async function createOrganizationInvitation(input: { organizationId: string; email: string; role: Exclude<OrganizationRole, "owner">; createdByUserId: string }) {
  await connectMongo();
  const email = normalizeEmail(input.email);
  const invitation = await OrganizationInvitationModel.findOneAndUpdate(
    { organizationId: objectId(input.organizationId, "Organization"), email, status: "pending" },
    {
      $set: { role: input.role, createdByUserId: objectId(input.createdByUserId, "User"), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) },
      $setOnInsert: { organizationId: objectId(input.organizationId, "Organization"), email, status: "pending" },
    },
    { upsert: true, new: true },
  ).lean();
  return { id: asId(invitation!._id), email: invitation!.email, role: invitation!.role as OrganizationRole, status: invitation!.status, expiresAt: invitation!.expiresAt };
}

export async function listOrganizationInvitations(organizationId: string) {
  await connectMongo();
  const now = new Date();
  const id = objectId(organizationId, "Organization");
  await OrganizationInvitationModel.updateMany({ organizationId: id, status: "pending", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const invitations = await OrganizationInvitationModel.find({ organizationId: id }).sort({ createdAt: -1 }).lean();
  return invitations.map(invitation => ({ id: asId(invitation._id), email: invitation.email, role: invitation.role as OrganizationRole, status: invitation.status, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt }));
}

export async function revokeOrganizationInvitation(organizationId: string, invitationId: string) {
  await connectMongo();
  const invitation = await OrganizationInvitationModel.findOneAndUpdate(
    { _id: objectId(invitationId, "Invitation"), organizationId: objectId(organizationId, "Organization"), status: "pending" },
    { $set: { status: "revoked" } },
    { new: true },
  ).lean();
  if (!invitation) throw new Error("Pending invitation not found.");
  return { id: asId(invitation._id), status: invitation.status };
}

export async function removeOrganizationMember(input: { organizationId: string; membershipId: string; protectedUserId: string }) {
  await connectMongo();
  const membership = await MembershipModel.findOne({ _id: objectId(input.membershipId, "Membership"), organizationId: objectId(input.organizationId, "Organization") }).lean();
  if (!membership) throw new Error("Membership not found.");
  if (membership.role === "owner" || asId(membership.userId) === input.protectedUserId) throw new Error("The organization owner cannot be removed from this workspace.");
  await MembershipModel.deleteOne({ _id: membership._id });
  return { id: asId(membership._id) };
}

export async function createElection(input: {
  organizationId: string;
  title: string;
  description?: string;
  ballotPrompt: string;
  ballotMode: BallotMode;
  resultsVisibility: ResultsVisibility;
  opensAt?: Date;
  closesAt?: Date;
  createdByUserId: string;
}) {
  await connectMongo();
  const election = await ElectionModel.create({
    organizationId: objectId(input.organizationId, "Organization"),
    createdByUserId: objectId(input.createdByUserId, "User"),
    title: input.title,
    description: input.description || null,
    ballotPrompt: input.ballotPrompt,
    ballotMode: input.ballotMode,
    resultsVisibility: input.resultsVisibility,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
  });
  await BallotModel.create({
    organizationId: objectId(input.organizationId, "Organization"),
    electionId: election._id,
    prompt: input.ballotPrompt,
    mode: input.ballotMode,
  });
  return asElection(election.toObject());
}

export async function listElectionsForOrganization(organizationId: string) {
  await connectMongo();
  const elections = await ElectionModel.find({ organizationId: objectId(organizationId, "Organization") }).sort({ updatedAt: -1 }).lean();
  return elections.map(asElection);
}

export async function getElectionById(electionId: string) {
  await connectMongo();
  const id = objectId(electionId, "Election");
  const now = new Date();
  await ElectionModel.updateOne({ _id: id, status: "scheduled", opensAt: { $lte: now } }, { $set: { status: "open" } });
  await ElectionModel.updateOne({ _id: id, status: "open", closesAt: { $lte: now } }, { $set: { status: "closed" } });
  const election = await ElectionModel.findById(id).lean();
  if (!election) return null;
  const [candidates, ballot] = await Promise.all([
    CandidateModel.find({ electionId: election._id }).sort({ sortOrder: 1, name: 1 }).lean(),
    BallotModel.findOne({ electionId: election._id }).lean(),
  ]);
  return {
    ...asElection(election),
    ballotPrompt: ballot?.prompt ?? election.ballotPrompt,
    ballotMode: ballot?.mode ?? election.ballotMode,
    candidates: candidates.map(candidate => ({
      id: asId(candidate._id),
      name: candidate.name,
      biography: candidate.biography ?? null,
      sortOrder: candidate.sortOrder,
    })),
  };
}

export async function setElectionStatus(electionId: string, status: ElectionStatus) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { status } });
  return getElectionById(electionId);
}

export async function setElectionBallotMode(electionId: string, ballotMode: BallotMode) {
  await connectMongo();
  const id = objectId(electionId, "Election");
  await Promise.all([
    ElectionModel.findByIdAndUpdate(id, { $set: { ballotMode } }),
    BallotModel.findOneAndUpdate({ electionId: id }, { $set: { mode: ballotMode } }),
  ]);
  return getElectionById(electionId);
}

export async function setElectionSchedule(electionId: string, opensAt: Date | null, closesAt: Date | null) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { opensAt, closesAt } });
  return getElectionById(electionId);
}

export async function setElectionResultsVisibility(electionId: string, resultsVisibility: ResultsVisibility) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { resultsVisibility } });
  return getElectionById(electionId);
}

export async function addCandidate(input: { electionId: string; name: string; biography?: string }) {
  await connectMongo();
  const last = await CandidateModel.findOne({ electionId: objectId(input.electionId, "Election") }).sort({ sortOrder: -1 }).lean();
  const candidate = await CandidateModel.create({
    electionId: objectId(input.electionId, "Election"),
    name: input.name,
    biography: input.biography || null,
    sortOrder: (last?.sortOrder ?? -1) + 1,
  });
  return { id: asId(candidate._id), name: candidate.name, biography: candidate.biography ?? null, sortOrder: candidate.sortOrder };
}

export async function removeCandidate(electionId: string, candidateId: string) {
  await connectMongo();
  const candidate = await CandidateModel.findOneAndDelete({ _id: objectId(candidateId, "Candidate"), electionId: objectId(electionId, "Election") }).lean();
  if (!candidate) throw new Error("Candidate not found on this election.");
  return { id: asId(candidate._id) };
}

export async function createOrUpdateVoterEligibility(input: { electionId: string; email: string; displayName?: string }) {
  await connectMongo();
  const voter = await VoterEligibilityModel.findOneAndUpdate(
    { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) },
    { $set: { displayName: input.displayName || null, invitationStatus: "pending", invitationExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) }, $setOnInsert: { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) } },
    { upsert: true, new: true },
  ).lean();
  return { id: asId(voter!._id), email: voter!.email, displayName: voter!.displayName ?? null, hasVoted: voter!.hasVoted, invitationStatus: voter!.invitationStatus };
}

export async function listVoterEligibility(electionId: string) {
  await connectMongo();
  const now = new Date();
  const electionObjectId = objectId(electionId, "Election");
  await VoterEligibilityModel.updateMany({ electionId: electionObjectId, invitationStatus: "pending", invitationExpiresAt: { $lte: now } }, { $set: { invitationStatus: "expired" } });
  const voters = await VoterEligibilityModel.find({ electionId: electionObjectId }).sort({ email: 1 }).lean();
  return voters.map(voter => ({ id: asId(voter._id), email: voter.email, displayName: voter.displayName ?? null, hasVoted: voter.hasVoted, invitationStatus: voter.invitationStatus, activationStatus: voter.userId ? "active" : "awaiting_account", createdAt: voter.createdAt }));
}

export async function removeVoterEligibility(electionId: string, voterId: string) {
  await connectMongo();
  const voter = await VoterEligibilityModel.findOneAndUpdate({ _id: objectId(voterId, "Voter"), electionId: objectId(electionId, "Election"), hasVoted: false }, { $set: { invitationStatus: "revoked" } }, { new: true }).lean();
  if (!voter) throw new Error("This voter cannot be removed because they have already voted or are not in this election.");
  return { id: asId(voter._id) };
}

export async function getVoterEnrollmentCount(electionId: string) {
  await connectMongo();
  return VoterEligibilityModel.countDocuments({ electionId: objectId(electionId, "Election"), $or: [{ invitationStatus: { $in: ["pending", "accepted"] } }, { invitationStatus: { $exists: false } }] });
}

export async function getVotingEligibility(input: { electionId: string; userId: string; email: string }) {
  await connectMongo();
  const electionId = objectId(input.electionId, "Election");
  const userId = objectId(input.userId, "User");
  const conditions: Record<string, unknown>[] = [{ userId }];
  if (input.email) conditions.push({ email: normalizeEmail(input.email) });
  const voter = await VoterEligibilityModel.findOne({ electionId, $and: [{ $or: [{ invitationStatus: { $in: ["pending", "accepted"] } }, { invitationStatus: { $exists: false } }] }, { $or: conditions }] }).lean();
  if (!voter) return null;
  if (!voter.userId) {
    await VoterEligibilityModel.updateOne({ _id: voter._id, userId: null }, { $set: { userId, invitationStatus: "accepted" } });
    voter.userId = userId;
    voter.invitationStatus = "accepted";
  }
  return { id: asId(voter._id), hasVoted: voter.hasVoted };
}

export async function castVote(input: { electionId: string; candidateId: string; voterEligibilityId: string; mode: BallotMode }) {
  await connectMongo();
  const electionId = objectId(input.electionId, "Election");
  const candidateId = objectId(input.candidateId, "Candidate");
  const eligibilityId = objectId(input.voterEligibilityId, "Eligibility");
  const candidate = await CandidateModel.exists({ _id: candidateId, electionId });
  if (!candidate) throw new Error("Candidate does not belong to this election.");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await VoterEligibilityModel.findOneAndUpdate(
        { _id: eligibilityId, electionId, hasVoted: false },
        { $set: { hasVoted: true } },
        { new: true, session },
      );
      if (!claimed) throw new Error("A ballot has already been submitted for this election.");
      await VoteModel.create(
        [{
          electionId,
          candidateId,
          mode: input.mode,
          ...(input.mode === "attributable" ? { voterEligibilityId: eligibilityId } : {}),
        }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export async function getElectionResults(electionId: string) {
  await connectMongo();
  const objectElectionId = objectId(electionId, "Election");
  const [candidateResults, eligibleVoters] = await Promise.all([
    CandidateModel.aggregate([
      { $match: { electionId: objectElectionId } },
      { $lookup: { from: "votes", localField: "_id", foreignField: "candidateId", as: "ballots" } },
      { $project: { candidateId: "$_id", candidateName: "$name", voteCount: { $size: "$ballots" }, sortOrder: 1 } },
      { $sort: { voteCount: -1, sortOrder: 1 } },
    ]),
    VoterEligibilityModel.countDocuments({ electionId: objectElectionId }),
  ]);
  return {
    candidateResults: candidateResults.map(result => ({ candidateId: asId(result.candidateId), candidateName: result.candidateName, voteCount: result.voteCount })),
    eligibleVoters,
  };
}

export async function listAuditEvents(organizationId: string, targetId?: string) {
  await connectMongo();
  const filter: Record<string, unknown> = { organizationId: objectId(organizationId, "Organization") };
  if (targetId) filter.targetId = targetId;
  const events = await AuditEventModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return events.map(event => ({ id: asId(event._id), eventType: event.eventType, targetType: event.targetType, targetId: event.targetId, metadata: event.metadata ?? null, createdAt: event.createdAt }));
}

export async function getElectionRecordExport(electionId: string) {
  const election = await getElectionById(electionId);
  if (!election) throw new Error("Election not found.");
  const [voters, results, auditEvents] = await Promise.all([
    listVoterEligibility(electionId),
    getElectionResults(electionId),
    listAuditEvents(election.organizationId, electionId),
  ]);
  return { generatedAt: new Date(), election: { ...election, candidates: election.candidates, voterCount: voters.length }, results, auditEvents };
}

export async function writeAuditEvent(input: { organizationId: string; actorUserId?: string; eventType: string; targetType: string; targetId?: string; metadata?: Record<string, unknown> }) {
  await connectMongo();
  await AuditEventModel.create({
    organizationId: objectId(input.organizationId, "Organization"),
    actorUserId: input.actorUserId ? objectId(input.actorUserId, "User") : null,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
}
