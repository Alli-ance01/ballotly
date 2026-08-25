import mongoose, { Schema } from "mongoose";
import type {
  BallotMode,
  ElectionStatus,
  OrganizationRole,
  PlatformRole,
  ResultsVisibility,
} from "./types";

const platformRoles: PlatformRole[] = ["user", "admin"];
const organizationRoles: OrganizationRole[] = ["owner", "admin", "member"];
const electionStatuses: ElectionStatus[] = ["draft", "scheduled", "open", "closed", "archived"];
const ballotModes: BallotMode[] = ["anonymous", "attributable"];
const resultVisibilities: ResultsVisibility[] = ["after_close", "always", "admins_only"];

const userSchema = new Schema(
  {
    openId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    email: { type: String, default: null, unique: true, sparse: true, lowercase: true, trim: true, index: true },
    loginMethod: { type: String, default: null },
    passwordHash: { type: String, default: null, select: false },
    role: { type: String, enum: platformRoles, default: "user" },
    lastSignedIn: { type: Date, default: Date.now },
    emailVerifiedAt: { type: Date, default: null },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true },
);

const membershipSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: organizationRoles, default: "member" },
  },
  { timestamps: true },
);
membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

const organizationInvitationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    status: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true },
    acceptedByUserId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);
organizationInvitationSchema.index({ organizationId: 1, email: 1, status: 1 });

const loginAttemptSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    failureCount: { type: Number, default: 0 },
    windowStartedAt: { type: Date, default: Date.now },
    blockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

const accountActionTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
accountActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const electionSchema = new Schema(
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
    closesAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const ballotSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    electionId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    prompt: { type: String, required: true, trim: true },
    mode: { type: String, enum: ballotModes, default: "anonymous" },
  },
  { timestamps: true },
);

const candidateSchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    biography: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const voterEligibilitySchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, default: null, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, default: null },
    hasVoted: { type: Boolean, default: false },
    invitationStatus: { type: String, enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true },
    invitationExpiresAt: { type: Date, default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) },
  },
  { timestamps: true },
);
voterEligibilitySchema.index({ electionId: 1, email: 1 }, { unique: true });

const voteSchema = new Schema(
  {
    electionId: { type: Schema.Types.ObjectId, required: true, index: true },
    candidateId: { type: Schema.Types.ObjectId, required: true, index: true },
    // Stored only for attributable elections. Anonymous ballots do not persist an identity link.
    voterEligibilityId: { type: Schema.Types.ObjectId, default: null, unique: true, sparse: true },
    mode: { type: String, enum: ballotModes, required: true },
    castAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
voteSchema.index({ electionId: 1, candidateId: 1 });

const auditEventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    eventType: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditEventSchema.index({ organizationId: 1, createdAt: -1 });

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const OrganizationModel = mongoose.models.Organization || mongoose.model("Organization", organizationSchema);
export const MembershipModel = mongoose.models.OrganizationMembership || mongoose.model("OrganizationMembership", membershipSchema);
export const OrganizationInvitationModel = mongoose.models.OrganizationInvitation || mongoose.model("OrganizationInvitation", organizationInvitationSchema);
export const LoginAttemptModel = mongoose.models.LoginAttempt || mongoose.model("LoginAttempt", loginAttemptSchema);
export const AccountActionTokenModel = mongoose.models.AccountActionToken || mongoose.model("AccountActionToken", accountActionTokenSchema);
export const ElectionModel = mongoose.models.Election || mongoose.model("Election", electionSchema);
export const BallotModel = mongoose.models.Ballot || mongoose.model("Ballot", ballotSchema);
export const CandidateModel = mongoose.models.Candidate || mongoose.model("Candidate", candidateSchema);
export const VoterEligibilityModel = mongoose.models.VoterEligibility || mongoose.model("VoterEligibility", voterEligibilitySchema);
export const VoteModel = mongoose.models.Vote || mongoose.model("Vote", voteSchema);
export const AuditEventModel = mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Add a MongoDB Atlas connection string before using protected platform features.");
  }
  connectionPromise ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 7000 });
  return connectionPromise;
}
