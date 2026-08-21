import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addCandidate,
  createElection,
  createOrUpdateVoterEligibility,
  getElectionById,
  getElectionResults,
  getElectionRecordExport,
  getOrganizationAccess,
  getVoterEnrollmentCount,
  listElectionsForOrganization,
  listVoterEligibility,
  listAuditEvents,
  removeCandidate,
  removeVoterEligibility,
  setElectionBallotMode,
  setElectionResultsVisibility,
  setElectionSchedule,
  setElectionStatus,
  writeAuditEvent,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertElectionReadyForLaunch, assertElectionTransition, canChangeBallotMode, electionStatuses, normalizeEmail, parseVoterRoster } from "../votingRules";
import { canManageOrganization } from "../authorizationRules";

const objectIdInput = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
async function requireManager(organizationId: string, userId: string) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access || !canManageOrganization(access.membership.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization administrator access is required." });
  }
  return access;
}

async function requireMember(organizationId: string, userId: string) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this organization." });
  return access;
}

export const electionRouter = router({
  list: protectedProcedure
    .input(z.object({ organizationId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      await requireMember(input.organizationId, ctx.user.id);
      return listElectionsForOrganization(input.organizationId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: objectIdInput,
        title: z.string().trim().min(3).max(160),
        description: z.string().trim().max(2000).optional(),
        ballotPrompt: z.string().trim().min(3).max(400),
        ballotMode: z.enum(["anonymous", "attributable"]).default("anonymous"),
        resultsVisibility: z.enum(["after_close", "always", "admins_only"]).default("after_close"),
        opensAt: z.coerce.date().optional(),
        closesAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireManager(input.organizationId, ctx.user.id);
      if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The closing time must be after the opening time." });
      }
      const election = await createElection({ ...input, createdByUserId: ctx.user.id });
      await writeAuditEvent({
        organizationId: input.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.created",
        targetType: "election",
        targetId: election.id,
        metadata: { ballotMode: election.ballotMode },
      });
      return election;
    }),

  get: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireMember(election.organizationId, ctx.user.id);
      return election;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ electionId: objectIdInput, status: z.enum(electionStatuses) }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      try {
        assertElectionTransition(election.status, input.status);
        if (input.status === "scheduled" && (!election.opensAt || !election.closesAt)) throw new Error("Set both an opening and closing time before scheduling this election.");
        if (input.status === "open") {
          assertElectionReadyForLaunch({ candidateCount: election.candidates.length, voterCount: await getVoterEnrollmentCount(election.id), status: election.status, opensAt: election.opensAt });
        }
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid election lifecycle transition." });
      }
      const updated = await setElectionStatus(election.id, input.status);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.status_changed", targetType: "election", targetId: election.id, metadata: { from: election.status, to: input.status } });
      return updated;
    }),

  updateBallotMode: protectedProcedure
    .input(z.object({ electionId: objectIdInput, ballotMode: z.enum(["anonymous", "attributable"]) }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      const voterCount = await getVoterEnrollmentCount(election.id);
      if (!canChangeBallotMode(election.status, voterCount)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ballot privacy cannot change after voter enrollment begins. Create a new election if the mode needs to change." });
      }
      const updated = await setElectionBallotMode(election.id, input.ballotMode);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.ballot_mode_changed", targetType: "election", targetId: election.id, metadata: { from: election.ballotMode, to: input.ballotMode } });
      return updated;
    }),

  updateSchedule: protectedProcedure
    .input(z.object({ electionId: objectIdInput, opensAt: z.coerce.date().nullable(), closesAt: z.coerce.date().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The schedule is locked once an election opens." });
      }
      if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The closing time must be after the opening time." });
      }
      const updated = await setElectionSchedule(election.id, input.opensAt, input.closesAt);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.schedule_updated", targetType: "election", targetId: election.id });
      return updated;
    }),

  addCandidate: protectedProcedure
    .input(z.object({ electionId: objectIdInput, name: z.string().trim().min(2).max(120), biography: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Candidates can only be changed before voting opens." });
      }
      const candidate = await addCandidate(input);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "candidate.added", targetType: "candidate", targetId: candidate.id });
      return candidate;
    }),

  removeCandidate: protectedProcedure
    .input(z.object({ electionId: objectIdInput, candidateId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError({ code: "BAD_REQUEST", message: "Candidates are locked once voting opens." });
      const candidate = await removeCandidate(election.id, input.candidateId);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "candidate.removed", targetType: "candidate", targetId: candidate.id });
      return candidate;
    }),

  enrollVoter: protectedProcedure
    .input(z.object({ electionId: objectIdInput, email: z.string().email().max(320), displayName: z.string().trim().max(160).optional() }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
      }
      const voter = await createOrUpdateVoterEligibility({ ...input, email: normalizeEmail(input.email) });
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.enrolled", targetType: "voter_eligibility", targetId: voter.id });
      return voter;
    }),

  importVoters: protectedProcedure
    .input(z.object({ electionId: objectIdInput, roster: z.string().min(1).max(100000) }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
      const parsed = parseVoterRoster(input.roster);
      if (parsed.rejected.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Correct ${parsed.rejected.length} roster issue${parsed.rejected.length === 1 ? "" : "s"} before importing.` });
      for (const voter of parsed.accepted) await createOrUpdateVoterEligibility({ electionId: election.id, ...voter });
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.roster_imported", targetType: "election", targetId: election.id, metadata: { count: parsed.accepted.length } });
      return { imported: parsed.accepted.length };
    }),

  removeVoter: protectedProcedure
    .input(z.object({ electionId: objectIdInput, voterId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError({ code: "BAD_REQUEST", message: "Voter eligibility is locked once voting opens." });
      try {
        const voter = await removeVoterEligibility(election.id, input.voterId);
        await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "voter.removed", targetType: "voter_eligibility", targetId: voter.id });
        return voter;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to remove this voter." });
      }
    }),

  updateResultsVisibility: protectedProcedure
    .input(z.object({ electionId: objectIdInput, resultsVisibility: z.enum(["after_close", "always", "admins_only"]) }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") throw new TRPCError({ code: "BAD_REQUEST", message: "Results visibility is locked once voting opens." });
      const updated = await setElectionResultsVisibility(election.id, input.resultsVisibility);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.results_visibility_changed", targetType: "election", targetId: election.id, metadata: { resultsVisibility: input.resultsVisibility } });
      return updated;
    }),

  listVoters: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      return listVoterEligibility(election.id);
    }),

  results: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      const isClosed = election.status === "closed" || election.status === "archived";
      if (election.resultsVisibility === "after_close" && !isClosed) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Results are available after the election closes." });
      }
      return getElectionResults(election.id);
    }),

  audit: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      return listAuditEvents(election.organizationId, election.id);
    }),

  exportRecord: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      await requireManager(election.organizationId, ctx.user.id);
      const record = await getElectionRecordExport(election.id);
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: ctx.user.id, eventType: "election.record_exported", targetType: "election", targetId: election.id });
      return record;
    }),
});
