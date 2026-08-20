import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { castVote, getElectionById, getVotingEligibility, writeAuditEvent } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertVoteEligibility, isElectionOpen, normalizeEmail } from "../votingRules";

const objectIdInput = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export const votingRouter = router({
  ballot: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      const eligibility = await getVotingEligibility({ electionId: election.id, userId: ctx.user.id, email: normalizeEmail(ctx.user.email ?? "") });
      if (!eligibility) throw new TRPCError({ code: "FORBIDDEN", message: "You are not enrolled as a voter for this election." });
      return {
        election,
        eligibility: { hasVoted: eligibility.hasVoted, isOpen: isElectionOpen(election) },
        disclosure: election.ballotMode === "attributable"
          ? "This is an attributable ballot. Election administrators can see how each enrolled voter votes."
          : "This is an anonymous ballot. Your identity is used to confirm eligibility, but election administrators cannot view a voter-to-selection link.",
      };
    }),

  cast: protectedProcedure
    .input(z.object({ electionId: objectIdInput, candidateId: objectIdInput, attributableDisclosureAcknowledged: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      const eligibility = await getVotingEligibility({ electionId: election.id, userId: ctx.user.id, email: normalizeEmail(ctx.user.email ?? "") });
      try {
        assertVoteEligibility({ election, eligibilityFound: Boolean(eligibility), alreadyVoted: Boolean(eligibility?.hasVoted) });
      } catch (error) {
        throw new TRPCError({ code: "FORBIDDEN", message: error instanceof Error ? error.message : "You cannot submit a ballot for this election." });
      }
      if (election.ballotMode === "attributable" && !input.attributableDisclosureAcknowledged) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You must acknowledge that election administrators can view your recorded vote before submitting." });
      }
      if (!eligibility) throw new TRPCError({ code: "FORBIDDEN", message: "You are not eligible to vote in this election." });
      try {
        await castVote({ electionId: election.id, candidateId: input.candidateId, voterEligibilityId: eligibility.id, mode: election.ballotMode });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to submit your ballot.";
        throw new TRPCError({ code: /candidate/i.test(message) ? "BAD_REQUEST" : "CONFLICT", message });
      }
      await writeAuditEvent({ organizationId: election.organizationId, actorUserId: election.ballotMode === "attributable" ? ctx.user.id : undefined, eventType: election.ballotMode === "anonymous" ? "anonymous_ballot.submitted" : "attributable_ballot.submitted", targetType: "election", targetId: election.id, metadata: { ballotMode: election.ballotMode } });
      return { success: true, ballotMode: election.ballotMode };
    }),
});
