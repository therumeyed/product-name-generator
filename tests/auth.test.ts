import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { attemptLogin, MAX_FAILED_LOGINS } from "@/lib/auth/login";
import { generatePassword, validatePassword, validateUsername } from "@/lib/auth/password";
import { hasRole } from "@/lib/auth/guards";
import { resetDb } from "./helpers";
import { createUser, resetPassword, setUserActive, UserError } from "@/lib/users";

let brandId: string;
const PW = "correct-horse-battery";

beforeAll(async () => {
  await resetDb();
  brandId = (await db.brand.create({ data: { name: "Test", slug: "test" } })).id;
});
beforeEach(async () => {
  await db.auditEvent.deleteMany();
  await db.user.deleteMany();
  await db.brand.update({ where: { id: brandId }, data: { active: true } });
});
afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

const mk = (username = "buyer1", role: "buyer" | "admin" = "buyer") =>
  createUser({ username, displayName: "B", role, brandId, password: PW });

describe("password helpers", () => {
  it("generates readable strong passwords", () => {
    const p = generatePassword();
    expect(p).toHaveLength(16);
    expect(p).not.toMatch(/[0OlI1]/);
    expect(validatePassword(p)).toBeNull();
  });
  it("validates", () => {
    expect(validatePassword("short")).toMatch(/at least/);
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("sg-buyer.1")).toBeNull();
  });
});

describe("roles", () => {
  it("ranks owner > admin > buyer", () => {
    expect(hasRole({ role: "buyer" }, "admin")).toBe(false);
    expect(hasRole({ role: "admin" }, "admin")).toBe(true);
    expect(hasRole({ role: "owner" }, "admin")).toBe(true);
    expect(hasRole({ role: "admin" }, "owner")).toBe(false);
  });
});

describe("login", () => {
  it("accepts correct credentials, case-insensitive username, and issues a versioned token", async () => {
    await mk("Buyer1");
    const r = await attemptLogin(" BUYER1 ", PW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const { payload } = await jwtVerify(r.token, new TextEncoder().encode(process.env.AUTH_SECRET!));
      expect(payload.sv).toBe(0);
    }
  });

  it("gives the same error for unknown user and wrong password", async () => {
    await mk();
    const a = await attemptLogin("nobody", PW);
    const b = await attemptLogin("buyer1", "wrong-password-x");
    expect(a).toEqual(b);
  });

  it("locks after repeated failures, even for the right password", async () => {
    await mk();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attemptLogin("buyer1", "bad-password-123");
    const r = await attemptLogin("buyer1", PW);
    expect(r.ok).toBe(false);
    const later = await attemptLogin("buyer1", PW, new Date(Date.now() + 16 * 60_000));
    expect(later.ok).toBe(true);
  });

  it("rejects disabled users and disabled brands", async () => {
    await mk();
    await setUserActive("buyer1", false);
    expect((await attemptLogin("buyer1", PW)).ok).toBe(false);
    await setUserActive("buyer1", true);
    expect((await attemptLogin("buyer1", PW)).ok).toBe(true);
    await db.brand.update({ where: { id: brandId }, data: { active: false } });
    expect((await attemptLogin("buyer1", PW)).ok).toBe(false);
  });

  it("password reset swaps the password and bumps sessionVersion", async () => {
    await mk();
    const before = await db.user.findUniqueOrThrow({ where: { username: "buyer1" } });
    const { password } = await resetPassword("buyer1");
    const after = await db.user.findUniqueOrThrow({ where: { username: "buyer1" } });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect((await attemptLogin("buyer1", PW)).ok).toBe(false);
    expect((await attemptLogin("buyer1", password)).ok).toBe(true);
  });
});

describe("user creation rules", () => {
  it("rejects duplicates, brandless buyers and weak passwords", async () => {
    await mk();
    await expect(mk()).rejects.toBeInstanceOf(UserError);
    await expect(createUser({ username: "x-user", displayName: "x", role: "buyer", brandId: null })).rejects.toThrow(/brand/);
    await expect(createUser({ username: "weak-1", displayName: "x", role: "buyer", brandId, password: "short" })).rejects.toThrow(/at least/);
  });
  it("never stores the plaintext password", async () => {
    const { password } = await createUser({ username: "gen-1", displayName: "g", role: "buyer", brandId });
    const u = await db.user.findUniqueOrThrow({ where: { username: "gen-1" } });
    expect(u.passwordHash).not.toContain(password);
    expect(u.passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("login does not depend on provider settings", () => {
  it("signs in even when live-mode provider keys are missing", async () => {
    await mk("nokeys");
    const saved = { ...process.env };
    process.env.PROVIDER_MODE = "live";
    delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_MODEL; delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
    try { expect((await attemptLogin("nokeys", PW)).ok).toBe(true); } finally { process.env = saved; }
  });
});
