import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { electionRouter } from "./routers/elections";
import { organizationRouter } from "./routers/organizations";
import { votingRouter } from "./routers/voting";
import { platformRouter } from "./routers/platform";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: authRouter,
  organizations: organizationRouter,
  elections: electionRouter,
  voting: votingRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
