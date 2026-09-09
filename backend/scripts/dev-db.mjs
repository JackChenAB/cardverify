// Starts a user-space PostgreSQL for local dev — no Docker, no sudo.
// Downloads a prebuilt binary into node_modules on first run.
// Data lives in backend/.pgdata (gitignored). Keep this process running.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Must live on the native Linux filesystem (ext4), NOT /mnt/* (drvfs) —
// Postgres refuses a data dir that isn't 0700/0750, and drvfs can't hold that.
const DATA_DIR = join(homedir(), '.cardverify-pgdata');
const PORT = 5433;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'devpass',
  port: PORT,
  persistent: true,
});

const alreadyInit = existsSync(`${DATA_DIR}/PG_VERSION`);
if (!alreadyInit) {
  console.log('[dev-db] initialising cluster...');
  await pg.initialise();
}

console.log('[dev-db] starting postgres on :' + PORT + ' ...');
await pg.start();

try {
  await pg.createDatabase('cardverify');
  console.log('[dev-db] created database "cardverify"');
} catch {
  console.log('[dev-db] database "cardverify" already exists');
}

console.log('[dev-db] READY — postgresql://postgres:devpass@localhost:' + PORT + '/cardverify');

async function shutdown() {
  console.log('\n[dev-db] stopping...');
  try {
    await pg.stop();
  } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep the process alive so postgres stays up.
setInterval(() => {}, 1 << 30);
