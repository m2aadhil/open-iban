import readline from 'node:readline/promises';
import { db } from '../db/index.js';
import { UserRepository } from '../db/repositories/UserRepository.js';
import { AuthService } from '../services/AuthService.js';

async function main() {
  const users = new UserRepository(db);
  const auth = new AuthService(users);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const username = (process.env.ADMIN_USERNAME ?? (await rl.question('Admin username: '))).trim();
  const password = process.env.ADMIN_PASSWORD ?? (await rl.question('Admin password: '));
  rl.close();

  if (!username || !password || password.length < 8) {
    console.error('Username required and password must be at least 8 chars');
    process.exit(1);
  }

  await auth.createUser(username, password);
  console.log(`Created admin user: ${username}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
