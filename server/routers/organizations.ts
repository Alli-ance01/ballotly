import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assignOrganizationRole, createOrganization, createOrganizationInvitation, getOrganizationAccess, listOrganizationInvitations, listOrganizationMembers, listOrganizationsForUser, removeOrganizationMember, revokeOrganizationInvitation, writeAuditEvent } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAssignOrganizationRoles } from "../authorizationRules";
import { isAccountEmailConfigured, sendAccountEmail } from "../email";

async function sendOrgInvitationEmail(input: { email: string; orgName: string; role: string }) {
  if (!isAccountEmailConfigured()) return;
  const baseUrl = process.env.APP_BASE_URL || "https://ballotly.alliancedev.online";
  const subject = `You have been invited to join ${input.orgName} on Ballotly`;
  const text = `You have been invited to join "${input.orgName}" as ${input.role === "admin" ? "an administrator" : "a member"} on Ballotly. Sign in or create a Ballotly account at ${baseUrl}/account to accept this invitation.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f0e5;color:#12383e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;background:#fffaf0;border:1px solid #d8caaf;padding:36px"><p style="letter-spacing:2px;font-size:11px;font-weight:700;color:#a34d3d">BALLOTLY WORKSPACE INVITATION</p><h1 style="font-family:Georgia,serif;font-weight:400">You have been invited to a workspace.</h1><p style="line-height:1.6">You have been invited to join <strong>${input.orgName}</strong> as ${input.role === "admin" ? "an administrator" : "a member"} on Ballotly. Sign in or create an account with this exact email address to accept the invitation.</p><p><a href="${baseUrl}/account" style="display:inline-block;background:#114b54;color:#fff9ec;padding:14px 20px;text-decoration:none;font-weight:bold">Accept invitation</a></p><p style="font-size:12px;line-height:1.5;color:#607277">This invitation expires in 14 days. If you were not expecting it, you can safely ignore this message.</p></main></body></html>`;
  await sendAccountEmail({ to: input.email, subject, text, html }).catch(() => {});
}

const objectIdInput = z.string().regex(/^[a-f\d]{24}$/i, "Invalid organization identifier.");

export const organizationRouter = router({
  listMine: protectedProcedure.query(({ ctx }) => listOrganizationsForUser(ctx.user.id)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.").min(3).max(80),
        description: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOrganization({ ...input, createdByUserId: ctx.user.id });
      } catch (error) {
        if (error instanceof Error && /duplicate/i.test(error.message)) {
          throw new TRPCError({ code: "CONFLICT", message: "That organization URL is already in use." });
        }
        throw error;
      }
    }),

  getAccess: protectedProcedure
    .input(z.object({ organizationId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this organization." });
      return access;
    }),

  members: protectedProcedure
    .input(z.object({ organizationId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this organization." });
      return listOrganizationMembers(input.organizationId);
    }),

  assignRole: protectedProcedure
    .input(z.object({ organizationId: objectIdInput, email: z.string().email().max(320), role: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access || !canAssignOrganizationRoles(access.membership.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the organization owner can assign workspace roles." });
      }
      try {
        const membership = await assignOrganizationRole(input);
        await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.role_assigned", targetType: "organization_membership", targetId: membership.id, metadata: { role: input.role } });
        return membership;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to assign the workspace role." });
      }
    }),

  invite: protectedProcedure
    .input(z.object({ organizationId: objectIdInput, email: z.string().email().max(320), role: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organization owner can invite workspace members." });
      const invitation = await createOrganizationInvitation({ ...input, createdByUserId: ctx.user.id });
      await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.invitation_created", targetType: "organization_invitation", targetId: invitation.id, metadata: { role: input.role } });
      // Send invitation email – non-blocking
      sendOrgInvitationEmail({ email: input.email, orgName: access.organization.name, role: input.role });
      return invitation;
    }),

  invitations: protectedProcedure
    .input(z.object({ organizationId: objectIdInput }))
    .query(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organization owner can view workspace invitations." });
      return listOrganizationInvitations(input.organizationId);
    }),

  revokeInvitation: protectedProcedure
    .input(z.object({ organizationId: objectIdInput, invitationId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organization owner can revoke workspace invitations." });
      const invitation = await revokeOrganizationInvitation(input.organizationId, input.invitationId);
      await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.invitation_revoked", targetType: "organization_invitation", targetId: invitation.id });
      return invitation;
    }),

  removeMember: protectedProcedure
    .input(z.object({ organizationId: objectIdInput, membershipId: objectIdInput }))
    .mutation(async ({ ctx, input }) => {
      const access = await getOrganizationAccess(input.organizationId, ctx.user.id);
      if (!access || !canAssignOrganizationRoles(access.membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organization owner can remove workspace members." });
      try {
        const removed = await removeOrganizationMember({ organizationId: input.organizationId, membershipId: input.membershipId, protectedUserId: ctx.user.id });
        await writeAuditEvent({ organizationId: input.organizationId, actorUserId: ctx.user.id, eventType: "organization.member_removed", targetType: "organization_membership", targetId: removed.id });
        return removed;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to remove this workspace member." });
      }
    }),
});
