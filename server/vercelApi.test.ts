import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBallotlyApi } from "./app";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(createBallotlyApi());
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start test server.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("Vercel-compatible authentication API", () => {
  it("returns a JSON tRPC response for an unauthenticated auth.me request", async () => {
    const response = await fetch(`${baseUrl}/api/trpc/auth.me?batch=1&input=${encodeURIComponent('{"json":null}')}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const payload = await response.json() as Array<{ result?: { data?: { json?: unknown } } }>;
    expect(payload[0]?.result?.data?.json).toBeNull();
  });
});
