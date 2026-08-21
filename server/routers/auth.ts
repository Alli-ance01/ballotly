import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  acceptPendingOrganizationInvitations,
  changeNativeUserPassword,
  clearLoginFailures,
  getUserWithPasswordByEmail,
  isLoginTemporarilyBlocked,
  recordLoginFailure,
  registerNativeUser,
} from "../db";
import { assertPasswordPolicy, normalizeAccountEmail } from "../authRules";
import { clearBallotlySessionCookie, createBallotlySession, setBallotlySessionCookie } from "../nativeAuth";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(72),
});

const fallbackPasswordHash = "$2a$12$JYptgJj3KOPjX6j.E72BO.1dBCznshZ66fpW1Jg59KQcOTu3mJ8tO";
const genericCredentialsError = () => new TRPCError({ code: "UNAUTHORIZED", message: "Email address or password is incorrect." });

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  register: publicProcedure
    .input(credentialsSchema.extend({ name: z.string().trim().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      try {
        assertPasswordPolicy(input.password);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password does not meet the security requirements." });
      }
      const email = normalizeAccountEmail(input.email);
      const passwordHash = await bcrypt.hash(input.password, 12);
      try {
        const user = await registerNativeUser({ name: input.name, email, passwordHash });
        await acceptPendingOrganizationInvitations(user);
        setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
        return user;
      } catch (error) {
        if (error instanceof Error && /already/i.test(error.message)) {
          throw new TRPCError({ code: "CONFLICT", message: "We could not create this account. Try signing in or use a different email address." });
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

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1).max(72), newPassword: z.string().min(1).max(72) }))
    .mutation(async ({ ctx, input }) => {
      const account = ctx.user.email ? await getUserWithPasswordByEmail(ctx.user.email) : null;
      if (!account?.passwordHash || !(await bcrypt.compare(input.currentPassword, account.passwordHash))) throw genericCredentialsError();
      try {
        assertPasswordPolicy(input.newPassword);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Password does not meet the security requirements." });
      }
      const user = await changeNativeUserPassword({ userId: ctx.user.id, passwordHash: await bcrypt.hash(input.newPassword, 12) });
      setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
      return { success: true } as const;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearBallotlySessionCookie(ctx.res);
    return { success: true } as const;
  }),
});
