import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getUserWithPasswordByEmail, registerNativeUser } from "../db";
import { assertPasswordPolicy, normalizeAccountEmail } from "../authRules";
import { clearBallotlySessionCookie, createBallotlySession, setBallotlySessionCookie } from "../nativeAuth";
import { publicProcedure, router } from "../_core/trpc";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(72),
});

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
        setBallotlySessionCookie(ctx.res, await createBallotlySession(user));
        return user;
      } catch (error) {
        if (error instanceof Error && /already/i.test(error.message)) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email address already exists. Sign in instead." });
        }
        throw error;
      }
    }),

  login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
    const account = await getUserWithPasswordByEmail(normalizeAccountEmail(input.email));
    if (!account || !account.passwordHash || !(await bcrypt.compare(input.password, account.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Email address or password is incorrect." });
    }
    setBallotlySessionCookie(ctx.res, await createBallotlySession(account.user));
    return account.user;
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearBallotlySessionCookie(ctx.res);
    return { success: true } as const;
  }),
});
