import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccountEmailHealth, isAccountEmailConfigured } from "./email";

describe("Ballotly Hostinger Mail API delivery", () => {
  const originalKey = process.env.MAIL_API_KEY;

  afterEach(() => {
    if (originalKey) process.env.MAIL_API_KEY = originalKey;
    else delete process.env.MAIL_API_KEY;
    vi.restoreAllMocks();
  });

  it("remains safely disabled until a server-only Hostinger API key is configured", async () => {
    delete process.env.MAIL_API_KEY;
    expect(isAccountEmailConfigured()).toBe(false);
    await expect(getAccountEmailHealth()).resolves.toEqual({ ready: false, reason: "MAIL_API_KEY is not configured" });
  });
});
