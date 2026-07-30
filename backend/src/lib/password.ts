import bcrypt from 'bcryptjs';

/**
 * Password hashing adapter — swappable.
 * Default implementation: bcryptjs with cost factor 12.
 */

const SALT_ROUNDS = 12;

export interface PasswordAdapter {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}

class BcryptPasswordAdapter implements PasswordAdapter {
  async hash(plain: string): Promise<string> {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return bcrypt.hash(plain, salt);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

export const password: PasswordAdapter = new BcryptPasswordAdapter();

export function hashPassword(plain: string): Promise<string> {
  return password.hash(plain);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return password.compare(plain, hash);
}
