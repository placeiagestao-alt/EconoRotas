import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildPasswordOpenId(email: string) {
  const digest = createHash("sha256").update(normalizeEmail(email)).digest("hex");
  return `pwd_${digest.slice(0, 60)}`;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;

  const [prefix, salt, storedKey] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !salt || !storedKey) {
    return false;
  }

  const storedBuffer = Buffer.from(storedKey, "base64url");
  const suppliedBuffer = (await scrypt(password, salt, storedBuffer.length)) as Buffer;

  if (storedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, suppliedBuffer);
}
