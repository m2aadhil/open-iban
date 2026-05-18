import { hash, verify } from '@node-rs/argon2';
import type { UserRepository } from '../db/repositories/UserRepository.js';

export class AuthService {
  constructor(private users: UserRepository) {}

  async createUser(username: string, password: string): Promise<void> {
    if (this.users.findByUsername(username)) {
      throw new Error(`User already exists: ${username}`);
    }
    const passwordHash = await hash(password);
    this.users.create(username, passwordHash);
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const user = this.users.findByUsername(username);
    if (!user) {
      // constant-time-ish dummy verify to limit user-enumeration timing oracle
      await verify('$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFh$bm90YXJlYWxoYXNoaGVyZQ', password).catch(() => false);
      return false;
    }
    try {
      return await verify(user.password_hash, password);
    } catch {
      return false;
    }
  }
}
