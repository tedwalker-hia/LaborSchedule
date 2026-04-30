import bcrypt from 'bcryptjs';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

// OWASP-recommended Argon2id parameters (19 MiB memory, 2 iterations, 1 thread).
// algorithm defaults to Argon2id in @node-rs/argon2.
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const BCRYPT_PATTERN = /^\$2[ab]\$/;

export function needsUpgrade(stored: string): boolean {
  return BCRYPT_PATTERN.test(stored);
}

export async function verify(password: string, stored: string): Promise<boolean> {
  if (needsUpgrade(stored)) {
    return bcrypt.compare(password, stored);
  }
  return argon2Verify(stored, password, ARGON2_OPTIONS);
}

export async function hash(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}
