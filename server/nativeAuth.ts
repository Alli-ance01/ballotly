import { SignJWT, jwtVerify } from "jose";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { getUserById } from "./db";
import type { AppUser } from "./types";
import { ENV } from "./_core/env";

export const BALLOTLY_SESSION_COOKIE = "ballotly_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret() {
  const secret = process.env.JWT_SECRET || ENV.cookieSecret;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters before native account sessions can be used.");
  }
  return new TextEncoder().encode(secret);
}

export async function createBallotlySession(user: AppUser) {
  return new SignJWT({ email: user.email ?? "", role: user.role, sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer("ballotly")
    .setAudience("ballotly-web")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(sessionSecret());
}

export async function verifyBallotlySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"], issuer: "ballotly", audience: "ballotly-web" });
    return typeof payload.sub === "string" && typeof payload.sv === "number" ? { userId: payload.sub, sessionVersion: payload.sv } : null;
  } catch {
    return null;
  }
}

export async function getBallotlySessionUser(req: Request) {
  const token = parse(req.headers.cookie ?? "")[BALLOTLY_SESSION_COOKIE];
  if (!token) return null;
  const session = await verifyBallotlySessionToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  return user && user.sessionVersion === session.sessionVersion ? user : null;
}

export function setBallotlySessionCookie(res: Response, token: string) {
  res.cookie(BALLOTLY_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS * 1000,
  });
}

export function clearBallotlySessionCookie(res: Response) {
  res.clearCookie(BALLOTLY_SESSION_COOKIE, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
  });
}
