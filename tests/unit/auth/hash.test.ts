import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { needsUpgrade, verify, hash } from '@/lib/auth/hash';

// Pre-hashed with bcrypt rounds=10 to keep test startup fast
const BCRYPT_HASH = await bcrypt.hash('correct-horse', 10);
const BCRYPT_HASH_2A = BCRYPT_HASH.replace(/^\$2b\$/, '$2a$');

describe('needsUpgrade', () => {
  it('detects $2b$ bcrypt prefix', () => {
    expect(needsUpgrade(BCRYPT_HASH)).toBe(true);
  });

  it('detects $2a$ bcrypt prefix', () => {
    expect(needsUpgrade(BCRYPT_HASH_2A)).toBe(true);
  });

  it('returns false for argon2 hash', async () => {
    const argonHash = await hash('some-password');
    expect(needsUpgrade(argonHash)).toBe(false);
  });
});

describe('verify', () => {
  it('verifies correct password against bcrypt hash', async () => {
    await expect(verify('correct-horse', BCRYPT_HASH)).resolves.toBe(true);
  });

  it('rejects wrong password against bcrypt hash', async () => {
    await expect(verify('wrong-password', BCRYPT_HASH)).resolves.toBe(false);
  });

  it('verifies correct password against argon2 hash', async () => {
    const argonHash = await hash('battery-staple');
    await expect(verify('battery-staple', argonHash)).resolves.toBe(true);
  });

  it('rejects wrong password against argon2 hash', async () => {
    const argonHash = await hash('battery-staple');
    await expect(verify('wrong-password', argonHash)).resolves.toBe(false);
  });
});

describe('hash', () => {
  it('produces argon2id hash string', async () => {
    const result = await hash('any-password');
    expect(result).toMatch(/^\$argon2id\$/);
  });

  it('produced hash verifies correctly', async () => {
    const result = await hash('round-trip');
    await expect(verify('round-trip', result)).resolves.toBe(true);
  });

  it('produces different hashes for same password (salted)', async () => {
    const [h1, h2] = await Promise.all([hash('same'), hash('same')]);
    expect(h1).not.toBe(h2);
  });
});
