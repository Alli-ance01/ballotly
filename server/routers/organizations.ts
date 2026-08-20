import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assignOrganizationRole, createOrganization, getOrganizationAccess, listOrganizationMembers, listOrganizationsForUser, writeAuditEvent } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAssignOrganizationRoles } from "../authorizationRules";

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
});
