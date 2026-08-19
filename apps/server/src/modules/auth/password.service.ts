// bcryptjs, not the native `bcrypt` binding: identical algorithm and hash
// format, but no node-gyp build step — which also drops the vulnerable
// node-pre-gyp/tar chain the native package pulls in.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/** Promise-based throughout — the original nested callbacks inside try/catch,
 * where a bcrypt error could never reach the catch block. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
