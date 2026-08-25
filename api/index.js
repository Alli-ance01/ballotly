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
  if (!ctx.user.emailVerifiedAt && !opts.path.startsWith("auth.")) {
    throw new TRPCError2({ code: "FORBIDDEN", message: "Verify your email address before accessing Ballotly workspaces or election activity." });
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
    if (!ctx.user.emailVerifiedAt) {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Verify your email address before accessing Ballotly administration." });
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
import { createHash, randomBytes } from "node:crypto";

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
    lastSignedIn: { type: Date, default: Date.now },
    emailVerifiedAt: { type: Date, default: null },
    sessionVersion: { type: Number, default: 0 }
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
var organizationInvitationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true },
    acceptedByUserId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);
organizationInvitationSchema.index({ organizationId: 1, email: 1, status: 1 });
var loginAttemptSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    failureCount: { type: Number, default: 0 },
    windowStartedAt: { type: Date, default: Date.now },
    blockedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);
var accountActionTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
accountActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
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
    hasVoted: { type: Boolean, default: false },
    invitationStatus: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    invitationExpiresAt: { type: Date, default: () => new Date(Date.now() + 1e3 * 60 * 60 * 24 * 14) }
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
var OrganizationInvitationModel = mongoose.models.OrganizationInvitation || mongoose.model("OrganizationInvitation", organizationInvitationSchema);
var LoginAttemptModel = mongoose.models.LoginAttempt || mongoose.model("LoginAttempt", loginAttemptSchema);
var AccountActionTokenModel = mongoose.models.AccountActionToken || mongoose.model("AccountActionToken", accountActionTokenSchema);
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
function assertElectionReadyForLaunch(input) {
  if (input.candidateCount < 2) throw new Error("Add at least two candidates before opening an election.");
  if (input.voterCount < 1) throw new Error("Enroll at least one voter before opening an election.");
  if (input.status === "scheduled" && input.opensAt && input.opensAt.getTime() > (input.now ?? /* @__PURE__ */ new Date()).getTime()) {
    throw new Error("This election is scheduled to open later. Update its schedule before opening it early.");
  }
}
function parseVoterRoster(raw) {
  const seen = /* @__PURE__ */ new Set();
  const accepted = [];
  const rejected = [];
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
    accepted.push({ email, ...displayName ? { displayName: displayName.slice(0, 160) } : {} });
  });
  return { accepted, rejected };
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
    lastSignedIn: record.lastSignedIn,
    emailVerifiedAt: record.emailVerifiedAt ?? null,
    sessionVersion: record.sessionVersion ?? 0
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
var hashAccountActionToken = (token) => createHash("sha256").update(token).digest("hex");
async function createAccountActionToken(input) {
  await connectMongo();
  const userId = objectId(input.userId, "User");
  await AccountActionTokenModel.deleteMany({ userId, purpose: input.purpose, usedAt: null });
  const token = randomBytes(32).toString("base64url");
  await AccountActionTokenModel.create({ userId, purpose: input.purpose, tokenHash: hashAccountActionToken(token), expiresAt: new Date(Date.now() + input.expiresInMinutes * 6e4) });
  return token;
}
async function consumeAccountActionToken(input) {
  await connectMongo();
  const record = await AccountActionTokenModel.findOneAndUpdate(
    { tokenHash: hashAccountActionToken(input.token), purpose: input.purpose, usedAt: null, expiresAt: { $gt: /* @__PURE__ */ new Date() } },
    { $set: { usedAt: /* @__PURE__ */ new Date() } },
    { new: true }
  ).lean();
  return record ? asId(record.userId) : null;
}
async function verifyNativeUserEmail(userId) {
  await connectMongo();
  const record = await UserModel.findByIdAndUpdate(objectId(userId, "User"), { $set: { emailVerifiedAt: /* @__PURE__ */ new Date() } }, { new: true }).lean();
  if (!record) throw new Error("Account could not be found.");
  return asUser(record);
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
    lastSignedIn: /* @__PURE__ */ new Date(),
    sessionVersion: 0
  });
  return asUser(user.toObject());
}
var LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1e3;
var LOGIN_MAX_FAILURES = 5;
async function isLoginTemporarilyBlocked(email) {
  await connectMongo();
  const attempt = await LoginAttemptModel.findOne({ email: normalizeEmail(email) }).lean();
  return Boolean(attempt?.blockedUntil && attempt.blockedUntil.getTime() > Date.now());
}
async function recordLoginFailure(email) {
  await connectMongo();
  const normalized = normalizeEmail(email);
  const now = /* @__PURE__ */ new Date();
  const attempt = await LoginAttemptModel.findOne({ email: normalized });
  const withinWindow = Boolean(attempt && now.getTime() - attempt.windowStartedAt.getTime() < LOGIN_FAILURE_WINDOW_MS);
  const failureCount = withinWindow ? (attempt?.failureCount ?? 0) + 1 : 1;
  const blockedUntil = failureCount >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_FAILURE_WINDOW_MS) : null;
  await LoginAttemptModel.findOneAndUpdate(
    { email: normalized },
    { $set: { failureCount, windowStartedAt: withinWindow ? attempt.windowStartedAt : now, blockedUntil } },
    { upsert: true }
  );
}
async function clearLoginFailures(email) {
  await connectMongo();
  await LoginAttemptModel.deleteOne({ email: normalizeEmail(email) });
}
async function changeNativeUserPassword(input) {
  await connectMongo();
  const user = await UserModel.findByIdAndUpdate(
    objectId(input.userId, "User"),
    { $set: { passwordHash: input.passwordHash, lastSignedIn: /* @__PURE__ */ new Date() }, $inc: { sessionVersion: 1 } },
    { new: true }
  ).lean();
  if (!user) throw new Error("Account not found.");
  return asUser(user);
}
async function acceptPendingOrganizationInvitations(user) {
  if (!user.email) return 0;
  await connectMongo();
  const now = /* @__PURE__ */ new Date();
  const email = normalizeEmail(user.email);
  await OrganizationInvitationModel.updateMany({ email, status: "pending", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const invitations = await OrganizationInvitationModel.find({ email, status: "pending", expiresAt: { $gt: now } });
  for (const invitation of invitations) {
    await MembershipModel.findOneAndUpdate(
      { organizationId: invitation.organizationId, userId: objectId(user.id, "User") },
      { $setOnInsert: { organizationId: invitation.organizationId, userId: objectId(user.id, "User"), role: invitation.role } },
      { upsert: true }
    );
    invitation.status = "accepted";
    invitation.acceptedByUserId = objectId(user.id, "User");
    await invitation.save();
  }
  return invitations.length;
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
async function createOrganizationInvitation(input) {
  await connectMongo();
  const email = normalizeEmail(input.email);
  const invitation = await OrganizationInvitationModel.findOneAndUpdate(
    { organizationId: objectId(input.organizationId, "Organization"), email, status: "pending" },
    {
      $set: { role: input.role, createdByUserId: objectId(input.createdByUserId, "User"), expiresAt: new Date(Date.now() + 1e3 * 60 * 60 * 24 * 14) },
      $setOnInsert: { organizationId: objectId(input.organizationId, "Organization"), email, status: "pending" }
    },
    { upsert: true, new: true }
  ).lean();
  return { id: asId(invitation._id), email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt };
}
async function listOrganizationInvitations(organizationId) {
  await connectMongo();
  const now = /* @__PURE__ */ new Date();
  const id = objectId(organizationId, "Organization");
  await OrganizationInvitationModel.updateMany({ organizationId: id, status: "pending", expiresAt: { $lte: now } }, { $set: { status: "expired" } });
  const invitations = await OrganizationInvitationModel.find({ organizationId: id }).sort({ createdAt: -1 }).lean();
  return invitations.map((invitation) => ({ id: asId(invitation._id), email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt }));
}
async function revokeOrganizationInvitation(organizationId, invitationId) {
  await connectMongo();
  const invitation = await OrganizationInvitationModel.findOneAndUpdate(
    { _id: objectId(invitationId, "Invitation"), organizationId: objectId(organizationId, "Organization"), status: "pending" },
    { $set: { status: "revoked" } },
    { new: true }
  ).lean();
  if (!invitation) throw new Error("Pending invitation not found.");
  return { id: asId(invitation._id), status: invitation.status };
}
async function removeOrganizationMember(input) {
  await connectMongo();
  const membership = await MembershipModel.findOne({ _id: objectId(input.membershipId, "Membership"), organizationId: objectId(input.organizationId, "Organization") }).lean();
  if (!membership) throw new Error("Membership not found.");
  if (membership.role === "owner" || asId(membership.userId) === input.protectedUserId) throw new Error("The organization owner cannot be removed from this workspace.");
  await MembershipModel.deleteOne({ _id: membership._id });
  return { id: asId(membership._id) };
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
  const id = objectId(electionId, "Election");
  const now = /* @__PURE__ */ new Date();
  await ElectionModel.updateOne({ _id: id, status: "scheduled", opensAt: { $lte: now } }, { $set: { status: "open" } });
  await ElectionModel.updateOne({ _id: id, status: "open", closesAt: { $lte: now } }, { $set: { status: "closed" } });
  const election = await ElectionModel.findById(id).lean();
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
async function setElectionResultsVisibility(electionId, resultsVisibility) {
  await connectMongo();
  await ElectionModel.findByIdAndUpdate(objectId(electionId, "Election"), { $set: { resultsVisibility } });
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
async function removeCandidate(electionId, candidateId) {
  await connectMongo();
  const candidate = await CandidateModel.findOneAndDelete({ _id: objectId(candidateId, "Candidate"), electionId: objectId(electionId, "Election") }).lean();
  if (!candidate) throw new Error("Candidate not found on this election.");
  return { id: asId(candidate._id) };
}
async function createOrUpdateVoterEligibility(input) {
  await connectMongo();
  const voter = await VoterEligibilityModel.findOneAndUpdate(
    { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) },
    { $set: { displayName: input.displayName || null, invitationStatus: "pending", invitationExpiresAt: new Date(Date.now() + 1e3 * 60 * 60 * 24 * 14) }, $setOnInsert: { electionId: objectId(input.electionId, "Election"), email: normalizeEmail(input.email) } },
    { upsert: true, new: true }
  ).lean();
  return { id: asId(voter._id), email: voter.email, displayName: voter.displayName ?? null, hasVoted: voter.hasVoted, invitationStatus: voter.invitationStatus };
}
async function listVoterEligibility(electionId) {
  await connectMongo();
  const now = /* @__PURE__ */ new Date();
  const electionObjectId = objectId(electionId, "Election");
  await VoterEligibilityModel.updateMany({ electionId: electionObjectId, invitationStatus: "pending", invitationExpiresAt: { $lte: now } }, { $set: { invitationStatus: "expired" } });
  const voters = await VoterEligibilityModel.find({ electionId: electionObjectId }).sort({ email: 1 }).lean();
  return voters.map((voter) => ({ id: asId(voter._id), email: voter.email, displayName: voter.displayName ?? null, hasVoted: voter.hasVoted, invitationStatus: voter.invitationStatus, activationStatus: voter.userId ? "active" : "awaiting_account", createdAt: voter.createdAt }));
}
async function removeVoterEligibility(electionId, voterId) {
  await connectMongo();
  const voter = await VoterEligibilityModel.findOneAndUpdate({ _id: objectId(voterId, "Voter"), electionId: objectId(electionId, "Election"), hasVoted: false }, { $set: { invitationStatus: "revoked" } }, { new: true }).lean();
  if (!voter) throw new Error("This voter cannot be removed because they have already voted or are not in this election.");
  return { id: asId(voter._id) };
}
async function getVoterEnrollmentCount(electionId) {
  await connectMongo();
  return VoterEligibilityModel.countDocuments({ electionId: objectId(electionId, "Election"), $or: [{ invitationStatus: { $in: ["pending", "accepted"] } }, { invitationStatus: { $exists: false } }] });
}
async function getVotingEligibility(input) {
  await connectMongo();
  const electionId = objectId(input.electionId, "Election");
  const userId = objectId(input.userId, "User");
  const conditions = [{ userId }];
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
async function listAuditEvents(organizationId, targetId) {
  await connectMongo();
  const filter = { organizationId: objectId(organizationId, "Organization") };
  if (targetId) filter.targetId = targetId;
  const events = await AuditEventModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return events.map((event) => ({ id: asId(event._id), eventType: event.eventType, targetType: event.targetType, targetId: event.targetId, metadata: event.metadata ?? null, createdAt: event.createdAt }));
}
async function getElectionRecordExport(electionId) {
  const election = await getElectionById(electionId);
  if (!election) throw new Error("Election not found.");
  const [voters, results, auditEvents] = await Promise.all([
    listVoterEligibility(electionId),
    getElectionResults(electionId),
    listAuditEvents(election.organizationId, electionId)
  ]);
  return { generatedAt: /* @__PURE__ */ new Date(), election: { ...election, candidates: election.candidates, voterCount: voters.length }, results, auditEvents };
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

// server/email.ts
import { AccountApi, Configuration, SendApi } from "hostinger-mail-api-sdk";
var HOSTINGER_MAIL_API = "https://api.mail.hostinger.com";
var DEFAULT_MAILBOX_RESOURCE_ID = "ACad23488cc893e90c508568b05252";
function getMailConfiguration() {
  const apiKey = process.env.MAIL_API_KEY;
  return apiKey ? new Configuration({ accessToken: apiKey, basePath: HOSTINGER_MAIL_API }) : null;
}
function getMailboxResourceId() {
  return process.env.MAILBOX_RESOURCE_ID || DEFAULT_MAILBOX_RESOURCE_ID;
}
async function sendAccountEmail(message) {
  const configuration = getMailConfiguration();
  if (!configuration) return { delivered: false, reason: "MAIL_API_KEY is not configured" };
  try {
    const payload = {
      to: [message.to],
      cc: [],
      bcc: [],
      displayName: "Ballotly",
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: [],
      // Hostinger's standalone send endpoint accepts omitted reply/forward fields;
      // SDK 1.18 types them as required despite the API's established behavior.
      inReplyTo: void 0,
      forwardOf: void 0
    };
    await new SendApi(configuration).sendEmail(getMailboxResourceId(), payload, {});
    return { delivered: true };
  } catch (error) {
    console.error("[account-email] Hostinger API delivery failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return { delivered: false, reason: "Hostinger Mail API delivery failed" };
  }
}
var escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
function accountEmailHtml(input) {
  return `<!doctype html><html><body style="margin:0;background:#f6f0e5;color:#12383e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;background:#fffaf0;border:1px solid #d8caaf;padding:36px"><p style="letter-spacing:2px;font-size:11px;font-weight:700;color:#a34d3d">BALLOTLY ACCOUNT SECURITY</p><h1 style="font-family:Georgia,serif;font-weight:400">${input.heading}</h1><p style="line-height:1.6">${input.body}</p><p><a href="${input.actionUrl}" style="display:inline-block;background:#114b54;color:#fff9ec;padding:14px 20px;text-decoration:none;font-weight:bold">${input.actionLabel}</a></p><p style="font-size:12px;line-height:1.5;color:#607277">This secure link expires in ${input.expiry} and can only be used once. If you did not request it, you can safely ignore this message.</p></main></body></html>`;
}
async function sendVerificationEmail(input) {
  const baseUrl = process.env.APP_BASE_URL || "https://ballotly.alliancedev.online";
  const actionUrl = `${baseUrl}/account/verify?token=${encodeURIComponent(input.token)}`;
  return sendAccountEmail({ to: input.email, subject: "Verify your Ballotly email address", text: `Verify your Ballotly account: ${actionUrl}`, html: accountEmailHtml({ heading: "Verify your email", body: `Hi ${escapeHtml(input.name || "there")}, confirm your email address to activate your Ballotly account.`, actionLabel: "Verify email", actionUrl, expiry: "24 hours" }) });
}
async function sendPasswordRecoveryEmail(input) {
  const baseUrl = process.env.APP_BASE_URL || "https://ballotly.alliancedev.online";
  const actionUrl = `${baseUrl}/account/reset-password?token=${encodeURIComponent(input.token)}`;
  return sendAccountEmail({ to: input.email, subject: "Reset your Ballotly password", text: `Reset your Ballotly password: ${actionUrl}`, html: accountEmailHtml({ heading: "Reset your password", body: `Hi ${escapeHtml(input.name || "there")}, use this one-time link to set a new Ballotly password.`, actionLabel: "Reset password", actionUrl, expiry: "30 minutes" }) });
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
  return new SignJWT({ email: user.email ?? "", role: user.role, sv: user.sessionVersion }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(user.id).setIssuer("ballotly").setAudience("ballotly-web").setIssuedAt().setExpirationTime(`${SESSION_DURATION_SECONDS}s`).sign(sessionSecret());
}
async function verifyBallotlySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"], issuer: "ballotly", audience: "ballotly-web" });
    return typeof payload.sub === "string" && typeof payload.sv === "number" ? { userId: payload.sub, sessionVersion: payload.sv } : null;
  } catch {
    return null;
  }
}
async function getBallotlySessionUser(req) {
  const token = parse(req.headers.cookie ?? "")[BALLOTLY_SESSION_COOKIE];
  if (!token) return null;
  const session = await verifyBallotlySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user && user.sessionVersion === session.sessionVersion ? user : null;
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
var fallbackPasswordHash = "$2a$12$JYptgJj3KOPjX6j.E72BO.1dBCznshZ66fpW1Jg59KQcOTu3mJ8tO";
var genericCredentialsError = () => new TRPCError3({ code: "UNAUTHORIZED", message: "Email address or password is incorrect." });
var accountActionTokenSchema2 = z2.object({ token: z2.string().min(32).max(256) });
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
      await acceptPendingOrganizationInvitations(user);
      setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
      const token = await createAccountActionToken({ userId: user.id, purpose: "verify_email", expiresInMinutes: 24 * 60 });
      await sendVerificationEmail({ email, name: user.name, token });
      return user;
    } catch (error) {
      if (error instanceof Error && /already/i.test(error.message)) {
        throw new TRPCError3({ code: "CONFLICT", message: "We could not create this account. Try signing in or use a different email address." });
      }
      throw error;
    }
  }),
  login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
    const email = normalizeAccountEmail(input.email);
    if (await isLoginTemporarilyBlocked(email)) {
      await bcrypt.compare(input.password, fallbackPasswordHash);
      throw genericCredentialsError();
    }
    const account = await getUserWithPasswordByEmail(email);
    const isValid = Boolean(account?.passwordHash) && await bcrypt.compare(input.password, account?.passwordHash ?? fallbackPasswordHash);
    if (!account || !isValid) {
      await recordLoginFailure(email);
      throw genericCredentialsError();
    }
    await clearLoginFailures(email);
    await acceptPendingOrganizationInvitations(account.user);
    setBallotlySessionCookie(ctx.res, await createBallotlySession(account.user));
    return account.user;
  }),
  changePassword: protectedProcedure.input(z2.object({ currentPassword: z2.string().min(1).max(72), newPassword: z2.string().min(1).max(72) })).mutation(async ({ ctx, input }) => {
    const account = ctx.user.email ? await getUserWithPasswordByEmail(ctx.user.email) : null;
    if (!account?.passwordHash || !await bcrypt.compare(input.currentPassword, account.passwordHash)) throw genericCredentialsError();
    try {
      assertPasswordPolicy(input.newPassword);
    } catch (error) {
      throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password does not meet the security requirements." });
    }
    const user = await changeNativeUserPassword({ userId: ctx.user.id, passwordHash: await bcrypt.hash(input.newPassword, 12) });
    setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
    return { success: true };
  }),
  resendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.email) throw new TRPCError3({ code: "BAD_REQUEST", message: "This account does not have an email address." });
    if (ctx.user.emailVerifiedAt) return { success: true, alreadyVerified: true };
    const token = await createAccountActionToken({ userId: ctx.user.id, purpose: "verify_email", expiresInMinutes: 24 * 60 });
    await sendVerificationEmail({ email: ctx.user.email, name: ctx.user.name, token });
    return { success: true, alreadyVerified: false };
  }),
  verifyEmail: publicProcedure.input(accountActionTokenSchema2).mutation(async ({ ctx, input }) => {
    const userId = await consumeAccountActionToken({ token: input.token, purpose: "verify_email" });
    if (!userId) throw new TRPCError3({ code: "BAD_REQUEST", message: "This verification link is invalid or has expired." });
    const user = await verifyNativeUserEmail(userId);
    setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
    return { success: true };
  }),
  requestPasswordReset: publicProcedure.input(z2.object({ email: z2.string().email().max(320) })).mutation(async ({ input }) => {
    const account = await getUserWithPasswordByEmail(normalizeAccountEmail(input.email));
    if (account?.user.email) {
      const token = await createAccountActionToken({ userId: account.user.id, purpose: "reset_password", expiresInMinutes: 30 });
      await sendPasswordRecoveryEmail({ email: account.user.email, name: account.user.name, token });
    }
    return { success: true };
  }),
  resetPassword: publicProcedure.input(accountActionTokenSchema2.extend({ newPassword: z2.string().min(1).max(72) })).mutation(async ({ ctx, input }) => {
    try {
      assertPasswordPolicy(input.newPassword);
    } catch (error) {
      throw new TRPCError3({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password does not meet the security requirements." });
    }
    const userId = await consumeAccountActionToken({ token: input.token, purpose: "reset_password" });
    if (!userId) throw new TRPCError3({ code: "BAD_REQUEST", message: "This password reset link is invalid or has expired." });
    const user = await changeNativeUserPassword({ userId, passwordHash: await bcrypt.hash(input.newPassword, 12) });
    setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
    return { success: true };
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
      if (input.status === "scheduled" && (!election.opensAt || !election.closesAt)) throw new Error("Set both an opening and closing time before scheduling this election.");
      if (input.status === "open") {
        assertElectionReadyForLaunch({ candidateCount: election.candidates.length, voterCount: await getVoterEnrollmentCount(election.id), status: election.status, opensAt: election.opensAt });
      }
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
  removeCandidate: protectedProcedure.input(z3.object({ electionId: objectIdInput, candidateId: objectIdInput })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError4({ code: "BAD_REQUEST", message: "Candidates are locked once voting opens." });
    const candidate = await removeCandidate(election.id, input.candidateId);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "candidate.removed", targetType: "candidate", targetId: candidate.id });
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
  importVoters: protectedProcedure.input(z3.object({ electionId: objectIdInput, roster: z3.string().min(1).max(1e5) })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError4({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
    const parsed = parseVoterRoster(input.roster);
    if (parsed.rejected.length) throw new TRPCError4({ code: "BAD_REQUEST", message: `Correct ${parsed.rejected.length} roster issue${parsed.rejected.length === 1 ? "" : "s"} before importing.` });
    for (const voter of parsed.accepted) await createOrUpdateVoterEligibility({ electionId: election.id, ...voter });
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.roster_imported", targetType: "election", targetId: election.id, metadata: { count: parsed.accepted.length } });
    return { imported: parsed.accepted.length };
  }),
  removeVoter: protectedProcedure.input(z3.object({ electionId: objectIdInput, voterId: objectIdInput })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError4({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
    try {
      const voter = await removeVoterEligibility(election.id, input.voterId);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.removed", targetType: "voter_eligibility", targetId: voter.id });
      return voter;
    } catch (error) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to remove this voter." });
    }
  }),
  updateResultsVisibility: protectedProcedure.input(z3.object({ electionId: objectIdInput, resultsVisibility: z3.enum(["after_close", "always", "admins_only"]) })).mutation(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError4({ code: "BAD_REQUEST", message: "Results visibility is locked once voting opens." });
    const updated = await setElectionResultsVisibility(election.id, input.resultsVisibility);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.results_visibility_changed", targetType: "election", targetId: election.id, metadata: { resultsVisibility: input.resultsVisibility } });
    return updated;
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
  }),
  audit: protectedProcedure.input(z3.object({ electionId: objectIdInput })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    return listAuditEvents(election.organizationId, election.id);
  }),
  exportRecord: protectedProcedure.input(z3.object({ electionId: objectIdInput })).query(async ({ ctx, input }) => {
    const election = await getElectionById(input.electionId);
    if (!election) throw new TRPCError4({ code: "NOT_FOUND", message: "Election not found." });
    await requireManager(election.organizationId, ctx.user.id);
    const record = await getElectionRecordExport(election.id);
    await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.record_exported", targetType: "election", targetId: election.id });
    return record;
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
  }),
  invite: protectedProcedure.input(z4.object({ organizationId: objectIdInput2, email: z4.string().email().max(320), role: z4.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError5({ code: "FORBIDDEN", message: "Only the organization owner can invite workspace members." });
    const invitation = await createOrganizationInvitation({ ...input, createdByUserId: ctx.user.id });
    await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.invitation_created", targetType: "organization_invitation", targetId: invitation.id, metadata: { role: input.role } });
    return invitation;
  }),
  invitations: protectedProcedure.input(z4.object({ organizationId: objectIdInput2 })).query(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError5({ code: "FORBIDDEN", message: "Only the organization owner can view workspace invitations." });
    return listOrganizationInvitations(input.organizationId);
  }),
  revokeInvitation: protectedProcedure.input(z4.object({ organizationId: objectIdInput2, invitationId: objectIdInput2 })).mutation(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError5({ code: "FORBIDDEN", message: "Only the organization owner can revoke workspace invitations." });
    const invitation = await revokeOrganizationInvitation(input.organizationId, input.invitationId);
    await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.invitation_revoked", targetType: "organization_invitation", targetId: invitation.id });
    return invitation;
  }),
  removeMember: protectedProcedure.input(z4.object({ organizationId: objectIdInput2, membershipId: objectIdInput2 })).mutation(async ({ ctx, input }) => {
    const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
    if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError5({ code: "FORBIDDEN", message: "Only the organization owner can remove workspace members." });
    try {
      const removed = await removeOrganizationMember({ organizationId: input.organizationId, membershipId: input.membershipId, protectedUserId: ctx.user.id });
      await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.member_removed", targetType: "organization_membership", targetId: removed.id });
      return removed;
    } catch (error) {
      throw new TRPCError5({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to remove this workspace member." });
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
