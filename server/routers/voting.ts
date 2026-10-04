import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  castVote,
  createOrUpdateVoterEligibility,
  getElectionById,
  getOrganizationAccess,
  getVotingEligibility,
  writeAuditEvent,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { isElectionOpen, normalizeEmail } from "../votingRules";
import { canManageOrganization } from "../authorizationRules";

const objectIdInput = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");

export const votingRouter = router({
  ballot: publicProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        voterToken: z.string().trim().min(6).max(128).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      }

      let isManager = false;
      if (ctx.user) {
        const access = await getOrganizationAccess(election.organizationId, ctx.user.id);
        isManager = Boolean(access && canManageOrganization(access.membership.role));
      }

      let eligibility = null;
      if (ctx.user) {
        eligibility = await getVotingEligibility({
          electionId: election.id,
          userId: ctx.user.id,
          email: normalizeEmail(ctx.user.email ?? ""),
        });
        if (!eligibility && isElectionOpen(election) && ctx.user.email) {
          await createOrUpdateVoterEligibility({
            electionId: election.id,
            email: normalizeEmail(ctx.user.email),
            displayName: ctx.user.name || undefined,
          });
          eligibility = await getVotingEligibility({
            electionId: election.id,
            userId: ctx.user.id,
            email: normalizeEmail(ctx.user.email),
          });
        }
      } else if (input.voterToken) {
        const guestEmail = `guest_${input.voterToken}@ballotly.local`;
        eligibility = await getVotingEligibility({
          electionId: election.id,
          email: guestEmail,
        });
      }

      if (!isElectionOpen(election) && !isManager) {
        if (election.status === "scheduled") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `This ballot is scheduled to open on ${
              election.opensAt ? new Date(election.opensAt).toLocaleString() : "a future date"
            }.`,
          });
        }
        if (election.status === "closed") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This ballot has concluded and is closed for voting.",
          });
        }
        if (election.status === "draft") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This ballot is in draft mode and has not yet been opened for voting.",
          });
        }
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This election is not currently open for voting.",
        });
      }

      return {
        election,
        eligibility: {
          hasVoted: eligibility?.hasVoted ?? false,
          isOpen: isElectionOpen(election),
          isManagerPreview: !eligibility && isManager,
        },
        disclosure:
          election.ballotMode === "attributable"
            ? "This is an attributable ballot. Election administrators can see how each enrolled voter votes."
            : "This is an anonymous ballot. Your identity is used to confirm eligibility, but election administrators cannot view a voter-to-selection link.",
      };
    }),

  cast: publicProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        candidateId: objectIdInput,
        voterToken: z.string().trim().min(6).max(128).optional(),
        voterName: z.string().trim().max(100).optional(),
        attributableDisclosureAcknowledged: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found." });
      }

      if (!isElectionOpen(election)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This election is not currently open for voting.",
        });
      }

      if (
        election.ballotMode === "attributable" &&
        !input.attributableDisclosureAcknowledged
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You must acknowledge that election administrators can view your recorded vote before submitting.",
        });
      }

      let voterEmail: string;
      let userId: string | undefined;
      let displayName: string | undefined;

      if (ctx.user) {
        voterEmail = normalizeEmail(ctx.user.email ?? "");
        userId = ctx.user.id;
        displayName = ctx.user.name || undefined;
      } else {
        if (!input.voterToken) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A voter token or session is required to cast a vote.",
          });
        }
        voterEmail = `guest_${input.voterToken}@ballotly.local`;
        userId = undefined;
        displayName = input.voterName?.trim() || "Guest Voter";
      }

      let eligibility = await getVotingEligibility({
        electionId: election.id,
        userId,
        email: voterEmail,
      });

      if (eligibility?.hasVoted) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A ballot has already been submitted for this election.",
        });
      }

      if (!eligibility) {
        eligibility = await createOrUpdateVoterEligibility({
          electionId: election.id,
          email: voterEmail,
          displayName,
        });
      }

      try {
        await castVote({
          electionId: election.id,
          candidateId: input.candidateId,
          voterEligibilityId: eligibility.id,
          mode: election.ballotMode,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to submit your ballot.";
        throw new TRPCError({
          code: /candidate/i.test(message) ? "BAD_REQUEST" : "CONFLICT",
          message,
        });
      }

      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId:
          election.ballotMode === "attributable" ? ctx.user?.id : undefined,
        eventType:
          election.ballotMode === "anonymous"
            ? "anonymous_ballot.submitted"
            : "attributable_ballot.submitted",
        targetType: "election",
        targetId: election.id,
        metadata: {
          ballotMode: election.ballotMode,
          isGuest: !ctx.user,
          ...(election.ballotMode === "attributable" ? { displayName } : {}),
        },
      });

      return { success: true, ballotMode: election.ballotMode };
    }),
});
