import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 12;

export const hashPassword = (pw: string) => bcrypt.hash(pw, ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// Used to burn equal time when a username doesn't exist, so timing doesn't reveal valid usernames.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", ROUNDS);

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

export function validateUsername(u: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)) {
    return "Username must be 3-40 characters: letters, numbers, dot, dash or underscore";
  }
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (pw.length > 128) return "Password is too long";
  return null;
}

// No look-alike characters (0/O, 1/l/I) because you'll be reading these out to clients.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generatePassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
