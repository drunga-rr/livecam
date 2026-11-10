import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE_NAME = "livecam_admin";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const attempts = new Map<string, { count: number; windowStart: number; blockedUntil: number }>();
// When ADMIN_PASSWORD is supplied, derive its scrypt hash once at startup.
// This lets deployments configure the password without a local Node.js install.
const environmentPassword = process.env.ADMIN_PASSWORD || "";
const environmentPasswordHash = environmentPassword
  ? `scrypt$${randomBytes(16).toString("hex")}$${scryptSync(environmentPassword, Buffer.from("livecam-admin-password-salt"), 64).toString("hex")}`
  : "";

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(actual, expected.toLowerCase());
}

function signature(expiry: string) {
  return createHmac("sha256", secret()).update(`${process.env.ADMIN_USERNAME}:${expiry}`).digest("hex");
}

function issueCookie(res: Response) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const token = `${expiry}.${signature(expiry)}`;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS * 1000,
  });
}

function hasValidSession(req: Request) {
  const raw = req.headers.cookie || "";
  const entry = raw.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return false;
  const token = decodeURIComponent(entry.slice(COOKIE_NAME.length + 1));
  const [expiry, supplied] = token.split(".");
  if (!expiry || !supplied || !/^\d+$/.test(expiry) || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  try {
    return safeEqual(signature(expiry), supplied);
  } catch {
    return false;
  }
}

export function adminStatus(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.json({ authenticated: hasValidSession(req) });
}

export function adminLogin(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const username = process.env.ADMIN_USERNAME || "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || environmentPasswordHash;
  if (!username || !passwordHash || (process.env.SESSION_SECRET || "").length < 32) {
    return res.status(503).json({ error: "admin_auth_not_configured" });
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const state = attempts.get(ip) || { count: 0, windowStart: now, blockedUntil: 0 };
  if (now < state.blockedUntil) return res.status(429).json({ error: "too_many_attempts" });
  if (now - state.windowStart > 15 * 60 * 1000) {
    state.count = 0;
    state.windowStart = now;
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const suppliedUser = typeof body.username === "string" ? body.username : "";
  const suppliedPassword = typeof body.password === "string" ? body.password : "";
  const valid = safeEqual(suppliedUser, username) && verifyPassword(suppliedPassword, passwordHash);
  if (!valid) {
    state.count += 1;
    if (state.count >= 8) state.blockedUntil = now + 15 * 60 * 1000;
    attempts.set(ip, state);
    return res.status(401).json({ error: "invalid_credentials" });
  }

  attempts.delete(ip);
  try {
    issueCookie(res);
  } catch {
    return res.status(503).json({ error: "admin_auth_not_configured" });
  }
  return res.json({ authenticated: true });
}

export function adminLogout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ success: true });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!hasValidSession(req)) return res.status(401).json({ error: "admin_login_required" });
  return next();
}
