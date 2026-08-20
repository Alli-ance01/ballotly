import { listPlatformOrganizations } from "../db";
import { adminProcedure, router } from "../_core/trpc";

export const platformRouter = router({
  organizations: adminProcedure.query(() => listPlatformOrganizations()),
});
