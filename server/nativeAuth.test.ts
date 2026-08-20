import { beforeAll, describe, expect, it } from "vitest";
import { createBallotlySession, verifyBallotlySessionToken } from "./nativeAuth";
import type { AppUser } from "./types";

const user: AppUser = {
  id: "507f1f77bcf86cd799439011",
  openId: "ballotly_sample",
  name: "Sample Member",
  email: "member@example.org",
  loginMethod: "password",
  role: "user",
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  lastSignedIn: new Date("2026-08-20T00:00:00.000Z"),
};

describe("Ballotly native sessions", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "ballotly-test-session-secret-that-is-long-enough";
  });

  it("creates a signed session that resolves to the authenticated account", async () => {
    const token = await createBallotlySession(user);
    await expect(verifyBallotlySessionToken(token)).resolves.toBe(user.id);
  });

  it("rejects malformed session tokens", async () => {
    await expect(verifyBallotlySessionToken("not-a-valid-token")).resolves.toBeNull();
  });
});
