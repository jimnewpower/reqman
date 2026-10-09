import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Problem } from "./model.js";

export interface Identity {
  username: string;
  display_name: string;
  roles: string[];
}

export const LOGIN_PROVENANCE =
  "local password login; repository files are not tamper-proof";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024)
    throw new Problem(
      2,
      "PASSWORD_LENGTH",
      "Use a password between 12 and 1024 characters.",
    );
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const parts = hash.split("$");
  const key = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(key, Buffer.from(parts[5], "hex"));
}
