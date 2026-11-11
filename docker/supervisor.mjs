// Migrates the database, then runs the worker and the Next.js server side by side.
// If either exits, the other is stopped and the container exits so Docker restarts it.
import { spawn, spawnSync } from 'node:child_process';

const env = process.env;
const WORKER = ['/app/worker/dist/worker.mjs'];

// Migrations run once, before the web process can open the database.
const migrate = spawnSync('node', [...WORKER, '--migrate-only'], { env, stdio: 'inherit' });
if (migrate.status !== 0) {
  console.error('playbill: database migration failed; not starting');
  process.exit(migrate.status ?? 1);
}

const children = [
  spawn('node', WORKER, { cwd: '/app/worker', env, stdio: 'inherit' }),
  spawn('node', ['server.js'], {
    cwd: '/app/web/apps/web',
    env: { ...env, PORT: env.PORT ?? '5056', HOSTNAME: env.HOSTNAME ?? '0.0.0.0' },
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 20_000).unref();
  Promise.all(children.map((c) => (c.exitCode !== null ? null : new Promise((r) => c.once('exit', r))))).then(() =>
    process.exit(code),
  );
}

for (const c of children) {
  c.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`playbill: ${c.spawnargs.join(' ')} exited (${signal ?? code}); stopping`);
      stop(code ?? 1);
    }
  });
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => stop(0));
