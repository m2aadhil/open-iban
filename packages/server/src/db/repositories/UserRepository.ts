import type Database from 'better-sqlite3';

interface UserRow {
  username: string;
  password_hash: string;
  created_at: number;
}

export class UserRepository {
  private findStmt;
  private insertStmt;

  constructor(db: Database.Database) {
    this.findStmt = db.prepare<[string], UserRow>(
      'SELECT username, password_hash, created_at FROM admin_users WHERE username = ?',
    );
    this.insertStmt = db.prepare(
      'INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)',
    );
  }

  findByUsername(username: string) {
    return this.findStmt.get(username);
  }

  create(username: string, passwordHash: string) {
    this.insertStmt.run(username, passwordHash, Date.now());
  }
}
