import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AppUser } from "../types";
import { getBallotlySessionUser } from "../nativeAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AppUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AppUser | null = null;

  user = await getBallotlySessionUser(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
