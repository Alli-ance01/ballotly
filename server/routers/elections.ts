import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addCandidate,
  claimElectionInvitation,
  createElectionInvitation,
  createElection,
  createOrganization,
  createOrUpdateVoterEligibility,
  getElectionById,
  getElectionInvitation,
  getElectionReadiness,
  getElectionResults,
  getElectionRecordExport,
  getOrganizationAccess,
  getVoterEnrollmentCount,
  listElectionsForOrganization,
  listOrganizationsForUser,
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
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  assertElectionReadyForLaunch,
  assertElectionTransition,
  canChangeBallotMode,
  electionStatuses,
  normalizeEmail,
  parseVoterRoster,
} from "../votingRules";
import { canManageOrganization } from "../authorizationRules";
import { sendElectionInvitationEmail } from "../email";

const objectIdInput = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
async function requireManager(organizationId: string, userId: string) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access || !canManageOrganization(access.membership.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization administrator access is required.",
    });
  }
  return access;
}

async function requireMember(organizationId: string, userId: string) {
  const access = await getOrganizationAccess(organizationId, userId);
  if (!access)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this organization.",
    });
  return access;
}

export const electionRouter = router({
  readiness: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireMember(election.organizationId, ctx.user.id);
      return getElectionReadiness(input.electionId);
    }),

  invitation: publicProcedure
    .input(z.object({ token: z.string().min(32).max(256) }))
    .query(async ({ input }) => {
      const invitation = await getElectionInvitation(input.token);
      if (!invitation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This election invitation is invalid or has expired.",
        });
      return {
        election: invitation.election,
        email: invitation.email.replace(/^(.{1,2}).*(@.*)$/, "$1•••$2"),
        displayName: invitation.displayName,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      };
    }),

  claimInvitation: protectedProcedure
    .input(z.object({ token: z.string().min(32).max(256) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await claimElectionInvitation(input.token, ctx.user);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to claim this election invitation.",
        });
      }
    }),

  myBallots: protectedProcedure.query(async ({ ctx }) => {
    const orgs = await listOrganizationsForUser(ctx.user.id);
    const elections = [];
    for (const org of orgs) {
      const orgElections = await listElectionsForOrganization(
        org.organization.id
      );
      elections.push(...orgElections);
    }
    return elections.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }),

  createQuickBallot: protectedProcedure
    .input(
      z.object({
        title: z
          .string()
          .trim()
          .min(2, "Title must be at least 2 characters")
          .max(160),
        description: z.string().trim().max(2000).optional(),
        ballotMode: z.enum(["anonymous", "attributable"]).default("anonymous"),
        options: z
          .array(z.string().trim().min(1, "Option cannot be empty").max(120))
          .min(2, "Add at least two options"),
        timing: z.enum(["manual", "scheduled"]).default("manual"),
        opensAt: z.coerce.date().optional().nullable(),
        closesAt: z.coerce.date().optional().nullable(),
        publishNow: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let orgs = await listOrganizationsForUser(ctx.user.id);
      let targetOrg = orgs.find(o => canManageOrganization(o.membership.role));
      if (!targetOrg) {
        const defaultName = `${ctx.user.name || "My"} Workspace`;
        const slug = `ws-${ctx.user.id.slice(-6)}-${Date.now().toString(36)}`;
        const createdOrg = await createOrganization({
          name: defaultName,
          slug,
          createdByUserId: ctx.user.id,
        });
        targetOrg = {
          organization: createdOrg,
          membership: { id: "", role: "owner" },
          stats: { electionCount: 0, memberCount: 1, activeElectionCount: 0 },
        };
      }

      if (
        input.timing === "scheduled" &&
        input.opensAt &&
        input.closesAt &&
        input.closesAt <= input.opensAt
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The closing time must be after the opening time.",
        });
      }

      const election = await createElection({
        organizationId: targetOrg.organization.id,
        createdByUserId: ctx.user.id,
        title: input.title,
        ballotPrompt: input.title,
        description: input.description,
        ballotMode: input.ballotMode,
        opensAt:
          input.timing === "scheduled" && input.opensAt
            ? input.opensAt
            : undefined,
        closesAt:
          input.timing === "scheduled" && input.closesAt
            ? input.closesAt
            : undefined,
      });

      for (const optionName of input.options) {
        await addCandidate({
          electionId: election.id,
          name: optionName,
        });
      }

      if (input.publishNow) {
        await setElectionStatus(election.id, "open");
      }

      await writeAuditEvent({
        organizationId: targetOrg.organization.id,
        actorUserId: ctx.user.id,
        eventType: "election.created",
        targetType: "election",
        targetId: election.id,
        metadata: { ballotMode: election.ballotMode, quickBallot: true },
      });

      return {
        electionId: election.id,
        status: input.publishNow ? "open" : "draft",
      };
    }),

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
        resultsVisibility: z
          .enum(["after_close", "always", "admins_only"])
          .default("after_close"),
        opensAt: z.coerce.date().optional(),
        closesAt: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireManager(input.organizationId, ctx.user.id);
      if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The closing time must be after the opening time.",
        });
      }
      const election = await createElection({
        ...input,
        createdByUserId: ctx.user.id,
      });
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
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireMember(election.organizationId, ctx.user.id);
      return election;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({ electionId: objectIdInput, status: z.enum(electionStatuses) })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      try {
        assertElectionTransition(election.status, input.status);
        if (
          input.status === "scheduled" &&
          (!election.opensAt || !election.closesAt)
        )
          throw new Error(
            "Set both an opening and closing time before scheduling this election."
          );
        if (input.status === "open") {
          assertElectionReadyForLaunch({
            candidateCount: election.candidates.length,
            voterCount: await getVoterEnrollmentCount(election.id),
            status: election.status,
            opensAt: election.opensAt,
          });
        }
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid election lifecycle transition.",
        });
      }
      const updated = await setElectionStatus(election.id, input.status);
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.status_changed",
        targetType: "election",
        targetId: election.id,
        metadata: { from: election.status, to: input.status },
      });
      return updated;
    }),

  updateBallotMode: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        ballotMode: z.enum(["anonymous", "attributable"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      const voterCount = await getVoterEnrollmentCount(election.id);
      if (!canChangeBallotMode(election.status, voterCount)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Ballot privacy cannot change after voter enrollment begins. Create a new election if the mode needs to change.",
        });
      }
      const updated = await setElectionBallotMode(
        election.id,
        input.ballotMode
      );
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.ballot_mode_changed",
        targetType: "election",
        targetId: election.id,
        metadata: { from: election.ballotMode, to: input.ballotMode },
      });
      return updated;
    }),

  updateSchedule: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        opensAt: z.coerce.date().nullable(),
        closesAt: z.coerce.date().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The schedule is locked once an election opens.",
        });
      }
      if (input.opensAt && input.closesAt && input.closesAt <= input.opensAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The closing time must be after the opening time.",
        });
      }
      const updated = await setElectionSchedule(
        election.id,
        input.opensAt,
        input.closesAt
      );
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.schedule_updated",
        targetType: "election",
        targetId: election.id,
      });
      return updated;
    }),

  addCandidate: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        name: z.string().trim().min(2).max(120),
        biography: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Candidates can only be changed before voting opens.",
        });
      }
      const candidate = await addCandidate(input);
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "candidate.added",
        targetType: "candidate",
        targetId: candidate.id,
      });
      return candidate;
    }),

  removeCandidate: protectedProcedure
    .input(z.object({ electionId: objectIdInput, candidateId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Candidates are locked once voting opens.",
        });
      const candidate = await removeCandidate(election.id, input.candidateId);
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "candidate.removed",
        targetType: "candidate",
        targetId: candidate.id,
      });
      return candidate;
    }),

  enrollVoter: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        email: z.string().email().max(320),
        displayName: z.string().trim().max(160).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Voter eligibility is locked once voting opens.",
        });
      }
      const voter = await createOrUpdateVoterEligibility({
        ...input,
        email: normalizeEmail(input.email),
      });
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "voter.enrolled",
        targetType: "voter_eligibility",
        targetId: voter.id,
      });

      return voter;
    }),

  sendInvitation: protectedProcedure
    .input(z.object({ electionId: objectIdInput, voterId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      const access = await requireManager(election.organizationId, ctx.user.id);
      const invitation = await createElectionInvitation(
        election.id,
        input.voterId
      );
      const delivery = await sendElectionInvitationEmail({
        email: invitation.voter.email,
        name: invitation.voter.displayName,
        organizationName: access.organization.name,
        electionTitle: election.title,
        ballotMode: election.ballotMode,
        opensAt: election.opensAt,
        closesAt: election.closesAt,
        token: invitation.token,
      });
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "voter.invitation_sent",
        targetType: "voter_eligibility",
        targetId: input.voterId,
        metadata: { delivered: delivery.delivered },
      });
      if (!delivery.delivered)
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: delivery.reason || "The invitation could not be delivered.",
        });
      return { delivered: true } as const;
    }),

  importVoters: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        roster: z.string().min(1).max(100000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Voter eligibility is locked once voting opens.",
        });
      const parsed = parseVoterRoster(input.roster);
      if (parsed.rejected.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Correct ${parsed.rejected.length} roster issue${parsed.rejected.length === 1 ? "" : "s"} before importing.`,
        });
      for (const voter of parsed.accepted)
        await createOrUpdateVoterEligibility({
          electionId: election.id,
          ...voter,
        });
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "voter.roster_imported",
        targetType: "election",
        targetId: election.id,
        metadata: { count: parsed.accepted.length },
      });

      return { imported: parsed.accepted.length };
    }),

  removeVoter: protectedProcedure
    .input(z.object({ electionId: objectIdInput, voterId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Voter eligibility is locked once voting opens.",
        });
      try {
        const voter = await removeVoterEligibility(election.id, input.voterId);
        await writeAuditEvent({
          organizationId: election.organizationId,
          actorUserId: ctx.user.id,
          eventType: "voter.removed",
          targetType: "voter_eligibility",
          targetId: voter.id,
        });
        return voter;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to remove this voter.",
        });
      }
    }),

  updateResultsVisibility: protectedProcedure
    .input(
      z.object({
        electionId: objectIdInput,
        resultsVisibility: z.enum(["after_close", "always", "admins_only"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      if (election.status !== "draft" && election.status !== "scheduled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Results visibility is locked once voting opens.",
        });
      const updated = await setElectionResultsVisibility(
        election.id,
        input.resultsVisibility
      );
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.results_visibility_changed",
        targetType: "election",
        targetId: election.id,
        metadata: { resultsVisibility: input.resultsVisibility },
      });
      return updated;
    }),

  listVoters: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      return listVoterEligibility(election.id);
    }),

  results: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      const isClosed =
        election.status === "closed" || election.status === "archived";
      if (election.resultsVisibility === "after_close" && !isClosed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are available after the election closes.",
        });
      }
      return getElectionResults(election.id);
    }),

  audit: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      return listAuditEvents(election.organizationId, election.id);
    }),

  exportRecord: protectedProcedure
    .input(z.object({ electionId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      await requireManager(election.organizationId, ctx.user.id);
      const record = await getElectionRecordExport(election.id);
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "election.record_exported",
        targetType: "election",
        targetId: election.id,
      });
      return record;
    }),

  resendVoterInvitation: protectedProcedure
    .input(z.object({ electionId: objectIdInput, voterId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const election = await getElectionById(input.electionId);
      if (!election)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Election not found.",
        });
      const access = await requireManager(election.organizationId, ctx.user.id);
      const invitation = await createElectionInvitation(
        election.id,
        input.voterId
      );
      const delivery = await sendElectionInvitationEmail({
        email: invitation.voter.email,
        name: invitation.voter.displayName,
        organizationName: access.organization.name,
        electionTitle: election.title,
        ballotMode: election.ballotMode,
        opensAt: election.opensAt,
        closesAt: election.closesAt,
        token: invitation.token,
      });
      await writeAuditEvent({
        organizationId: election.organizationId,
        actorUserId: ctx.user.id,
        eventType: "voter.invitation_sent",
        targetType: "voter_eligibility",
        targetId: input.voterId,
        metadata: { delivered: delivery.delivered, resent: true },
      });
      return { success: true, delivered: delivery.delivered };
    }),
});

