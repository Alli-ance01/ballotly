// server/app.ts
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/auth.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z as z2 } from "zod";

// server/db.ts
import mongoose2 from "mongoose";

// server/models.ts
import mongoose, { Schema } from "mongoose";
var platformRoles = ["user", "admin"];
var organizationRoles = ["owner", "admin", "member"];
var electionStatuses = ["draft", "scheduled", "open", "closed", "archived"];
var ballotModes = ["anonymous", "attributable"];
var resultVisibilities = ["after_close", "always", "admins_only"];
var userSchema = new Schema(
  {
    openId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    email: { type: String, default: null, unique: true, sparse: true, lowercase: true, trim: true, index: true },
    loginMethod: { type: String, default: null },
    passwordHash: { type: String, default: null, select: false },
    role: { type: String, enum: platformRoles, default: "user" },
    lastSignedIn: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
var organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, index: true }
  },
  { timestamps: true }
);
var membershipSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: organizationRoles, default: "member" }
  },
  { timestamps: true }
);
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
var electionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    ballotPrompt: { type: String, required: true, trim: true },
    status: { type: String, enum: electionStatuses, default: "draft", index: true },
    ballotMode: { type: String, enum: ballotModes, default: "anonymous", immutable: false },
    resultsVisibility: { type: String, enum: resultVisibilities, default: "after_close" },
    opensAt: { type: Date, default: null },
    closesAt: { type: Date, default: null }
  },
  { timestamps: true }
);
var ballotSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    electionId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    prompt: { type: String, required: true, trim: true },
    mode: { type: String, enum: ballotModes, default: "anonymous" }
  },
  { timestamps: true }
);
var candidateSchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    biography: { type: String, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);
var voterEligibilitySchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, default: null },
    hasVoted: { type: Boolean, default: false }
  },
  { timestamps: true }
);
voterEligibilitySchema.index({ electionId: 1, email: 1 }, { unique: true });
var voteSchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    candidateId: { type: Schema.Types.ObjectId, required: true, index: true },
    // Stored only for attributable elections. Anonymous ballots do not persist an identity link.
    voterEligibilityId: { type: Schema.Types.ObjectId, default: null, unique: true, sparse: true },
    mode: { type: String, enum: ballotModes, required: true },
    castAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);
voteSchema.index({ electionId: 1, candidateId: 1 });
var auditEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    eventType: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditEventSchema.index({ organizationId: 1, createdAt: -1 });
var UserModel = mongoose.models.User || mongoose.model("User", userSchema);
var OrganizationModel = mongoose.models.Organization || mongoose.model("Organization", organizationSchema);
var MembershipModel = mongoose.models.OrganizationMembership || mongoose.model("OrganizationMembership", membershipSchema);
var ElectionModel = mongoose.models.Election || mongoose.model("Election", electionSchema);
var BallotModel = mongoose.models.Ballot || mongoose.model("Ballot", ballotSchema);
var CandidateModel = mongoose.models.Candidate || mongoose.model("Candidate", candidateSchema);
var VoterEligibilityModel = mongoose.models.VoterEligibility || mongoose.model("VoterEligibility", voterEligibilitySchema);
var VoteModel = mongoose.models.Vote || mongoose.model("Vote", voteSchema);
var AuditEventModel = mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);
var connectionPromise = null;
async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Add a MongoDB Atlas connection string before using protected platform features.");
  }
  connectionPromise ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 7e3 });
  return connectionPromise;
}

// server/votingRules.ts
var electionStatuses2 = ["draft", "scheduled", "open", "closed", "archived"];
var allowedTransitions = {
  draft: ["scheduled", "open", "archived"],
  scheduled: ["draft", "open", "archived"],
  open: ["closed"],
  closed: ["archived"],
  archived: []
};
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function canTransitionElection(currentStatus, nextStatus) {
  return currentStatus === nextStatus || allowedTransitions[currentStatus].includes(nextStatus);
}
function assertElectionTransition(currentStatus, nextStatus) {
  if (!canTransitionElection(currentStatus, nextStatus)) {
    throw new Error(`An election cannot move from ${currentStatus} to ${nextStatus}.`);
  }
}
function canChangeBallotMode(status, enrolledVoterCount) {
  return status === "draft" && enrolledVoterCount === 0;
}
function isElectionOpen(election, now = /* @__PURE__ */ new Date()) {
  return election.status === "open" && (!election.opensAt || election.opensAt.getTime() <= now.getTime()) && (!election.closesAt || election.closesAt.getTime() > now.getTime());
}
function assertVoteEligibility(input) {
  if (!input.eligibilityFound) throw new Error("You are not enrolled as a voter for this election.");
  if (input.alreadyVoted) throw new Error("A ballot has already been submitted for this election.");
  if (!isElectionOpen(input.election, input.now)) throw new Error("This election is not currently open for voting.");
}

// server/db.ts
var asId = (value) => String(value);
function asUser(record) {
  return {
    id: asId(record._id),
    openId: record.openId,
    name: record.name ?? null,
    email: record.email ?? null,
    loginMethod: record.loginMethod ?? null,
    role: record.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSignedIn: record.lastSignedIn
  };
}
function asOrganization(record) {
  return {
    id: asId(record._id),
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    createdByUserId: asId(record.createdByUserId),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
function asElection(record) {
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
    updatedAt: record.updatedAt
  };
}
function objectId(id, label = "Record") {
  if (!mongoose2.isValidObjectId(id)) throw new Error(`${label} identifier is invalid.`);
  return new mongoose2.Types.ObjectId(id);
}
async function getUserById(id) {
  await connectMongo();
  const user = await UserModel.findById(objectId(id, "User")).lean();
  return user ? asUser(user) : null;
}
async function getUserWithPasswordByEmail(email) {
  await connectMongo();
  const record = await UserModel.findOne({ email }).select("+passwordHash").lean();
  if (!record) return null;
  return { user: asUser(record), passwordHash: record.passwordHash };
}
async function registerNativeUser(input) {
  await connectMongo();
  const existing = await UserModel.exists({ email: input.email });
  if (existing) throw new Error("An account with that email already exists.");
  const openId = `ballotly_${new mongoose2.Types.ObjectId().toString()}`;
  const user = await UserModel.create({
    openId,
    name: input.name,
    email: input.email,
    loginMethod: "password",
    passwordHash: input.passwordHash,
    role: "user",
    lastSignedIn: /* @__PURE__ */ new Date()
  });
  return asUser(user.toObject());
}
async function listOrganizationsForUser(userId) {
  await connectMongo();
  const memberships = await MembershipModel.find({ userId: objectId(userId, "User") }).sort({ updatedAt: -1 }).lean();
  const organizationIds = memberships.map((membership) => membership.organizationId);
  const organizations = await OrganizationModel.find({ _id: { $in: organizationIds } }).sort({ updatedAt: -1 }).lean();
  const membershipByOrganization = new Map(memberships.map((item) => [asId(item.organizationId), item]));
  return organizations.map((organization) => ({
    organization: asOrganization(organization),
    membership: {
      id: asId(membershipByOrganization.get(asId(organization._id))?._id),
      role: membershipByOrganization.get(asId(organization._id))?.role
    }
  }));
}
async function listPlatformOrganizations() {
  await connectMongo();
  const organizations = await OrganizationModel.find().sort({ createdAt: -1 }).lean();
  return Promise.all(organizations.map(async (organization) => ({
    organization: asOrganization(organization),
    electionCount: await ElectionModel.countDocuments({ organizationId: organization._id }),
    memberCount: await MembershipModel.countDocuments({ organizationId: organization._id })
  })));
}
async function createOrganization(input) {
  await connectMongo();
  const session = await mongoose2.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const [organization] = await OrganizationModel.create(
        [{ name: input.name, slug: input.slug, description: input.description || null, createdByUserId: objectId(input.createdByUserId, "User") }],
        { session }
      );
      await MembershipModel.create([{ organizationId: organization._id, userId: objectId(input.createdByUserId, "User"), role: "owner" }], { session });
      created = organization.toObject();
    });
    return asOrganization(created);
  } finally {
    await session.endSession();
  }
}
async function getOrganizationAccess(organizationId, userId) {
  await connectMongo();
  const [organization, membership] = await Promise.all([
    OrganizationModel.findById(objectId(organizationId, "Organization")).lean(),
    MembershipModel.findOne({ organizationId: objectId(organizationId, "Organization"), userId: objectId(userId, "User") }).lean()
  ]);
  if (!organization || !membership) return null;
  return {
    organization: asOrganization(organization),
    membership: { id: asId(membership._id), role: membership.role }
  };
}
async function listOrganizationMembers(organizationId) {
  await connectMongo();
  const memberships = await MembershipModel.find({ organizationId: objectId(organizationId, "Organization") }).sort({ createdAt: 1 }).lean();
  const users = await UserModel.find({ _id: { $in: memberships.map((membership) => membership.userId) } }).lean();
  const userById = new Map(users.map((user) => [asId(user._id), user]));
  return memberships.map((membership) => {
    const user = userById.get(asId(membership.userId));
    return { id: asId(membership._id), userId: asId(membership.userId), role: membership.role, name: user?.name ?? null, email: user?.email ?? null };
  });
}
async function assignOrganizationRole(input) {
  await connectMongo();
  const user = await UserModel.findOne({ email: normalizeEmail(input.email) }).lean();
  if (!user) throw new Error("That person must sign in to Ballotly once before they can be added to this workspace.");
  const membership = await MembershipModel.findOneAndUpdate(
    { organizationId: objectId(input.organizationId, "Organization"), userId: user._id },
    { $set: { role: input.role }, $setOnInsert: { organizationId: objectId(input.organizationId, "Organization"), userId: user._id } },
    { upsert: true, new: true }
  ).lean();
  return { id: asId(membership._id), userId: asId(user._id), role: membership.role, name: user.name ?? null, email: user.email ?? null };
}
async function createElection(input) {
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
    closesAt: input.closesAt ?? null
  });
  await BallotModel.create({
    organizationId: objectId(input.organizationId, "Organization"),
    electionId: election._id,
    prompt: input.ballotPrompt,
    mode: input.ballotMode
  });
  return asElection(election.toObject());
}
async function listElectionsForOrganization(organizationId) {
  await connectMongo();
  const elections = await ElectionModel.find({ organizationId: objectId(organizationId, "Organization") }).sort({ updatedAt: -1 }).lean();
  return elections.map(asElection);
}
async function getElectionById(electionId) {
  await connectMongo();
  const election = await ElectionModel.findById(objectId(electionId, "Election")).lean();
  if (!election) return null;
  const [candidates, ballot] = await Promise.all([
    CandidateModel.find({ electionId: election._id }).sort({ sortOrder: 1, name: 1 }).lean(),
    BallotModel.findOne({ electionId: election._id }).lean()
  ]);
  return {
    ...asElection(election),
    ballotPrompt: ballot?.prompt ?? election.ballotPrompt,
    ballotMode: ballot?.mode ?? election.ballotMode,
    candidates: candidates.map((candidate) => ({
      id: asId(candidate._id),
      name: candidate.name,
      biography: candidate.biography ?? null,
      sortOrder: candidate.sortOrder
    }))
  };
}
async function setElectionStatus(electionId, status) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { status } });
  return getElectionById(electionId);
}
async function setElectionBallotMode(electionId, ballotMode) {
  await connectMongo();
  const id = objectId(electionId, "Election");
  await Promise.all([
    ElectionModel.findByIdAndUpdate(id, { $set: { ballotMode } }),
    BallotModel.findOneAndUpdate({ electionId: id }, { $set: { mode: ballotMode } })
  ]);
  return getElectionById(electionId);
}
async function setElectionSchedule(electionId, opensAt, closesAt) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { opensAt, closesAt } });
  return getElectionById(electionId);
}
async function addCandidate(input) {
  await connectMongo();
  const last = await CandidateModel.findOne({ electionId: objectId(input.electionId, "Election") }).sort({ sortOrder: -1 }).lean();
  const candidate = await CandidateModel.create({
    electionId: objectId(input.electionId, "Election"),
    name: input.name,
    biography: input.biography || null,
    sortOrder: (last?.sortOrder ?? -1) + 1
  });
  return { id: asId(candidate._id), name: candidate.name, biography: candidate.biography ?? null, sortOrder: candidate.sortOrder };
}
async function createOrUpdateVoterEligibility(input) {
  await connectMongo();
  const voter = await VoterEligibilityModel.findOneAndUpdate(
    { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) },
    { $set: { displayName: input.displayName || null }, $setOnInsert: { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) } },
    { upsert: true, new: true }
  ).lean();
  return { id: asId(voter._id), email: voter.email, displayName: voter.displayName ?? null, hasVoted: voter.hasVoted };
}
async function listVoterEligibility(electionId) {
  await connectMongo();
  const voters = await VoterEligibilityModel.find({ electionId: objectId(electionId, "Election") }).sort({ email: 1 }).lean();
  return voters.map((voter) => ({ id: asId(voter._id), email: voter.email, displayName: voter.displayName ?? null, hasVoted: voter.hasVoted, createdAt: voter.createdAt }));
}
async function getVoterEnrollmentCount(electionId) {
  await connectMongo();
  return VoterEligibilityModel.countDocuments({ electionId: objectId(electionId, "Election") });
}
async function getVotingEligibility(input) {
  await connectMongo();
  const electionId = objectId(input.electionId, "Election");
  const userId = objectId(input.userId, "User");
  const conditions = [{ userId }];
  if (input.email) conditions.push({ email: normalizeEmail(input.email) });
  const voter = await VoterEligibilityModel.findOne({ electionId, $or: conditions }).lean();
  if (!voter) return null;
  if (!voter.userId) {
    await VoterEligibilityModel.updateOne({ _id: voter._id, userId: null }, { $set: { userId } });
    voter.userId = userId;
  }
  return { id: asId(voter._id), hasVoted: voter.hasVoted };
}
async function castVote(input) {
  await connectMongo();
  const electionId = objectId(input.electionId, "Election");
  const candidateId = objectId(input.candidateId, "Candidate");
  const eligibilityId = objectId(input.voterEligibilityId, "Eligibility");
  const candidate = await CandidateModel.exists({ _id: candidateId, electionId });
  if (!candidate) throw new Error("Candidate does not belong to this election.");
  const session = await mongoose2.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await VoterEligibilityModel.findOneAndUpdate(
        { _id: eligibilityId, electionId, hasVoted: false },
        { $set: { hasVoted: true } },
        { new: true, session }
      );
      if (!claimed) throw new Error("A ballot has already been submitted for this election.");
      await VoteModel.create(
        [{
          electionId,
          candidateId,
          mode: input.mode,
          ...input.mode === "attributable" ? { voterEligibilityId: eligibilityId } : {}
        }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
}
async function getElectionResults(electionId) {
  await connectMongo();
  const objectElectionId = objectId(electionId, "Election");
  const [candidateResults, eligibleVoters] = await Promise.all([
    CandidateModel.aggregate([
      { $match: { electionId: objectElectionId } },
      { $lookup: { from: "votes", localField: "_id", foreignField: "candidateId", as: "ballots" } },
      { $project: { candidateId: "$_id", candidateName: "$name", voteCount: { $size: "$ballots" }, sortOrder: 1 } },
      { $sort: { voteCount: -1, sortOrder: 1 } }
    ]),
    VoterEligibilityModel.countDocuments({ electionId: objectElectionId })
  ]);
  return {
    candidateResults: candidateResults.map((result) => ({ candidateId: asId(result.candidateId), candidateName: result.candidateName, voteCount: result.voteCount })),
    eligibleVoters
  };
}
async function writeAuditEvent(input) {
  await connectMongo();
  await AuditEventModel.create({
    organizationId: objectId(input.organizationId, "Organization"),
    actorUserId: input.actorUserId ? objectId(input.actorUserId, "User") : null,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null
  });
}

// server/authRules.ts
function assertPasswordPolicy(password) {
  if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
  if (password.length > 72) throw new Error("Use no more than 72 characters for your password.");
}
function normalizeAccountEmail(email) {
  return email.trim().toLowerCase();
}

// server/nativeAuth.ts
import { SignJWT, jwtVerify } from "jose";
import { parse } from "cookie";
var BALLOTLY_SESSION_COOKIE = "ballotly_session";
var SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
function sessionSecret() {
  const secret = process.env.JWT_SECRET || ENV.cookieSecret;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters before native account sessions can be used.");
  }
  return new TextEncoder().encode(secret);
}
async function createBallotlySession(user) {
  return new SignJWT({ email: user.email ?? "", role: user.role }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(user.id).setIssuedAt().setExpirationTime(`${SESSION_DURATION_SECONDS}s`).sign(sessionSecret());
}
async function verifyBallotlySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
async function getBallotlySessionUser(req) {
  const token = parse(req.headers.cookie ?? "")[BALLOTLY_SESSION_COOKIE];
  if (!token) return null;
  const userId = await verifyBallotlySessionToken(token);
  return userId ? getUserById(userId) : null;
}
function setBallotlySessionCookie(res, token) {
  res.cookie(BALLOTLY_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS * 1e3
  });
}
function clearBallotlySessionCookie(res) {
  res.clearCookie(BALLOTLY_SESSION_COOKIE, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/"
  });
}

// server/routers/auth.ts
var credentialsSchema = z2.object({
  email: z2.string().email().max(320),
  password: z2.string().min(1).max(72)
});
var authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  register: publicProcedure.input(credentialsSchema.extend({ name: z2.string().trim().min(2).max(100) })).mutation(async ({ ctx, input }) => {
    try {
      assertPasswordPolicy(input.password);
    } catch (error) {
      throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password does not meet the security requirements." });
    }
    const email = normalizeAccountEmail(input.email);
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await registerNativeUser({ name: input.name, email, passwordHash });
      setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
      return user;
    } catch (error) {
      if (error instanceof Error && /already/i.test(error.message)) {
        throw new TRPCError3({ code: "CONFLICT", message: "An account with that email address already exists. Sign in instead." });
      }
      throw error;
    }
  }),
  login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
    const account = await getUserWithPasswordByEmail(normalizeAccountEmail(input.email));
    if (!account || !account.passwordHash || !await bcrypt.compare(input.password, account.passwordHash)) {
      throw new TRPCError3({ code: "UNAUTHORIZED", message: "Email address or password is incorrect." });
    }
    setBallotlySessionCookie(ctx.res, await createBallotlySession(account.user));
    return account.user;
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    clearBallotlySessionCookie(ctx.res);
    return { success: true };
  })
});

// server/routers/elections.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { z as z3 } from "zod";

// server/authorizationRules.ts
function canManageOrganization(role) {
  return role === "owner" || role === "admin";
}
function canAssignOrganizationRoles(role) {
  return role === "owner";
}

// server/routers/elections.ts
var objectIdInput = z3.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
async function requireManager(organizationId, userId) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access || !canManageOrganization(access.membership.role)) {
    throw new TRPCError4({ code: "FORBIDDEN", message: "Organization administrator access is required." });
  }
  return access;
}
async function requireMember(organizationId, userId) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access) throw new TRPCError4({ code: "FORBIDDEN", message: "You do not have access to this organization." });
  return access;
}
var electionRouter = router({
  list: protectedProcedure.input(z3.object({ organizationId: objectIdInput })).query(async ({ ctx, input }) => {
    await requireMember(input.organizationId, ctx.user.id);
    return listElectionsForOrganization(input.organizationId);
  }),
  create: protectedProcedure.input(
    z3.object({
      organizationId: objectIdInput,
      title: z3.string().trim().min(3).max(160),
      description: z3.string().trim().max(2e3).optional(),
      ballotPrompt: z3.string().trim().min(3).max(400),
      ballotMode: z3.enum(["anonymous", "attributable"]).default("anonymous"),
      resultsVisibility: z3.enum(["after_close", "always", "admins_only"]).default("after_close"),
      opensAt: z3.coerce.date().optional(),
      closesAt: z3.coerce.date().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    await requireManager(input.organizationId, ctx.user.id);
    if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "The closing time must be after the opening time." });
    }
    const election = await createElection({ ...input, createdByUserId: ctx.user.id });
    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: ctx.user.id,
      eventType: "election.created",
      targetType: "election",
      targetId: election.id,
      metadata: { ballotMode: election.ballotMode }
    });
    return election;
  }),
  get: protectedProcedure.input(z3.object({ electionId: objectIdInput })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireMember(election.organizationId, ctx.user.id);
    return election;
  }),
  updateStatus: protectedProcedure.input(z3.object({ electionId: objectIdInput, status: z3.enum(electionStatuses2) })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    try {
      assertElectionTransition(election.status, input.status);
    } catch (error) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid election lifecycle transition." });
    }
    const updated = await setElectionStatus(election.id, input.status);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.status_changed", targetType: "election", targetId: election.id, metadata: { from: election.status, to: input.status } });
    return updated;
  }),
  updateBallotMode: protectedProcedure.input(z3.object({ electionId: objectIdInput, ballotMode: z3.enum(["anonymous", "attributable"]) })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    const voterCount = await getVoterEnrollmentCount(election.id);
    if (!canChangeBallotMode(election.status, voterCount)) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "Ballot privacy cannot change after voter enrollment begins. Create a new election if the mode needs to change." });
    }
    const updated = await setElectionBallotMode(election.id, input.ballotMode);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.ballot_mode_changed", targetType: "election", targetId: election.id, metadata: { from: election.ballotMode, to: input.ballotMode } });
    return updated;
  }),
  updateSchedule: protectedProcedure.input(z3.object({ electionId: objectIdInput, opensAt: z3.coerce.date().nullable(), closesAt: z3.coerce.date().nullable() })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "The schedule is locked once an election opens." });
    }
    if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "The closing time must be after the opening time." });
    }
    const updated = await setElectionSchedule(election.id, input.opensAt, input.closesAt);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.schedule_updated", targetType: "election", targetId: election.id });
    return updated;
  }),
  addCandidate: protectedProcedure.input(z3.object({ electionId: objectIdInput, name: z3.string().trim().min(2).max(120), biography: z3.string().trim().max(2e3).optional() })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "Candidates can only be changed before voting opens." });
    }
    const candidate = await addCandidate(input);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "candidate.added", targetType: "candidate", targetId: candidate.id });
    return candidate;
  }),
  enrollVoter: protectedProcedure.input(z3.object({ electionId: objectIdInput, email: z3.string().email().max(320), displayName: z3.string().trim().max(160).optional() })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
    }
    const voter = await createOrUpdateVoterEligibility({ ...input, email: normalizeEmail(input.email) });
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.enrolled", targetType: "voter_eligibility", targetId: voter.id });
    return voter;
  }),
  listVoters: protectedProcedure.input(z3.object({ electionId: objectIdInput })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    return listVoterEligibility(election.id);
  }),
  results: protectedProcedure.input(z3.object({ electionId: objectIdInput })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    const isClosed = election.status === "closed" || election.status === "archived";
    if (election.resultsVisibility === "after_close" && !isClosed) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Results are available after the election closes." });
    }
    return getElectionResults(election.id);
  })
});

// server/routers/organizations.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
import { z as z4 } from "zod";
var objectIdInput2 = z4.string().regex(/^[a-f\d]{24}$/i, "Invalid organization identifier.");
var organizationRouter = router({
  listMine: protectedProcedure.query(({ ctx }) => listOrganizationsForUser(ctx.user.id)),
  create: protectedProcedure.input(
    z4.object({
      name: z4.string().trim().min(2).max(120),
      slug: z4.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.").min(3).max(80),
      description: z4.string().trim().max(500).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      return await createOrganization({ ...input, createdByUserId: ctx.user.id });
    } catch (error) {
      if (error instanceof Error && /duplicate/i.test(error.message)) {
        throw new TRPCError5({ code: "CONFLICT", message: "That organization URL is already in use." });
      }
      throw error;
    }
  }),
  getAccess: protectedProcedure.input(z4.object({ organizationId: objectIdInput2 })).query(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access) throw new TRPCError5({ code: "FORBIDDEN", message: "You do not have access to this organization." });
    return access;
  }),
  members: protectedProcedure.input(z4.object({ organizationId: objectIdInput2 })).query(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access) throw new TRPCError5({ code: "FORBIDDEN", message: "You do not have access to this organization." });
    return listOrganizationMembers(input.organizationId);
  }),
  assignRole: protectedProcedure.input(z4.object({ organizationId: objectIdInput2, email: z4.string().email().max(320), role: z4.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access || !canAssignOrganizationRoles(access.membership.role)) {
      throw new TRPCError5({ code: "FORBIDDEN", message: "Only the organization owner can assign workspace roles." });
    }
    try {
      const membership = await assignOrganizationRole(input);
      await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.role_assigned", targetType: "organization_membership", targetId: membership.id, metadata: { role: input.role } });
      return membership;
    } catch (error) {
      throw new TRPCError5({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to assign the workspace role." });
    }
  })
});

// server/routers/voting.ts
import { TRPCError as TRPCError6 } from "@trpc/server";
import { z as z5 } from "zod";
var objectIdInput3 = z5.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
var votingRouter = router({
  ballot: protectedProcedure.input(z5.object({ electionId: objectIdInput3 })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError6({ code: "NOT_FOUND", message: "Election not found." });
    const eligibility = await getVotingEligibility({ electionId: election.id, userId: ctx.user.id, email: normalizeEmail(ctx.user.email ?? "") });
    if (!eligibility) throw new TRPCError6({ code: "FORBIDDEN", message: "You are not enrolled as a voter for this election." });
    return {
      election,
      eligibility: { hasVoted: eligibility.hasVoted, isOpen: isElectionOpen(election) },
      disclosure: election.ballotMode === "attributable" ? "This is an attributable ballot. Election administrators can see how each enrolled voter votes." : "This is an anonymous ballot. Your identity is used to confirm eligibility, but election administrators cannot view a voter-to-selection link."
    };
  }),
  cast: protectedProcedure.input(z5.object({ electionId: objectIdInput3, candidateId: objectIdInput3, attributableDisclosureAcknowledged: z5.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError6({ code: "NOT_FOUND", message: "Election not found." });
    const eligibility = await getVotingEligibility({ electionId: election.id, userId: ctx.user.id, email: normalizeEmail(ctx.user.email ?? "") });
    try {
      assertVoteEligibility({ election, eligibilityFound: Boolean(eligibility), alreadyVoted: Boolean(eligibility?.hasVoted) });
    } catch (error) {
      throw new TRPCError6({ code: "FORBIDDEN", message: error instanceof Error ? error.message : "You cannot submit a ballot for this election." });
    }
    if (election.ballotMode === "attributable" && !input.attributableDisclosureAcknowledged) {
      throw new TRPCError6({ code: "BAD_REQUEST", message: "You must acknowledge that election administrators can view your recorded vote before submitting." });
    }
    if (!eligibility) throw new TRPCError6({ code: "FORBIDDEN", message: "You are not eligible to vote in this election." });
    try {
      await castVote({ electionId: election.id, candidateId: input.candidateId, voterEligibilityId: eligibility.id, mode: election.ballotMode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit your ballot.";
      throw new TRPCError6({ code: /candidate/i.test(message) ? "BAD_REQUEST" : "CONFLICT", message });
    }
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: election.ballotMode === "attributable" ? ctx.user.id : void 0, eventType: election.ballotMode === "anonymous" ? "anonymous_ballot.submitted" : "attributable_ballot.submitted", targetType: "election", targetId: election.id, metadata: { ballotMode: election.ballotMode } });
    return { success: true, ballotMode: election.ballotMode };
  })
});

// server/routers/platform.ts
var platformRouter = router({
  organizations: adminProcedure.query(() => listPlatformOrganizations())
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: authRouter,
  organizations: organizationRouter,
  elections: electionRouter,
  voting: votingRouter,
  platform: platformRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  user = await getBallotlySessionUser(opts.req);
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/app.ts
function createBallotlyApi() {
  const app2 = express();
  app2.use(express.json({ limit: "2mb" }));
  app2.use(express.urlencoded({ limit: "2mb", extended: true }));
  registerStorageProxy(app2);
  app2.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app2;
}

// api/entry.ts
var app = createBallotlyApi();
var entry_default = app;
export {
  entry_default as default
};
