// Replaces a workspace's data with a sample profile (company, offerings, accounts, sources). Members stay.
//
//   npm run seed -- list
//   npm run seed -- <profile> [--workspace "Name"] [--env local|dev|prod] [--yes]
//
// Accounts are owned by the workspace's first admin. Background jobs are cleared.
import { createInterface } from 'node:readline/promises';
import { checkAccount, explain, options, useEnv } from './_env';
import { PROFILES } from './seed-profiles';

const HELP = `Load a sample profile into a workspace (replaces its company, offerings, accounts, sources and jobs; members stay)

  npm run seed -- list
  npm run seed -- <profile> [--workspace "Name"] [--env local|dev|prod] [--yes]

Profiles: ${Object.keys(PROFILES).join(', ')}
Without --workspace, the only workspace is used (or you're asked to pick).`;

const { env, args } = useEnv(process.argv.slice(2));
const { opts, rest } = options(args, ['workspace', 'yes']);
const [profileKey] = rest;

function fail(msg: string): never { console.error(`Error: ${msg}`); process.exit(1); }

async function main() {
  if (!profileKey || profileKey === 'help' || profileKey === '--help') { console.log(HELP); return; }
  if (profileKey === 'list') {
    for (const p of Object.values(PROFILES)) console.log(`  ${p.key.padEnd(10)} ${p.title}\n  ${''.padEnd(10)} ${p.description}\n`);
    return;
  }
  const profile = PROFILES[profileKey];
  if (!profile) fail(`No profile "${profileKey}". Available: ${Object.keys(PROFILES).join(', ')}`);

  await checkAccount(env);
  const { workspaces } = await import('../src/server/repo');
  const { loadProfile } = await import('../src/server/seed');
  const all = (await workspaces.list()).filter((w) => w.kind !== 'internal');
  if (all.length === 0) fail('No workspace yet. Add the first user: npm run users -- add you@company.com --name "You" --role admin');
  let ws = all[0];
  if (typeof opts.workspace === 'string') {
    const found = all.find((w) => w.name.toLowerCase() === String(opts.workspace).toLowerCase());
    if (!found) fail(`No workspace named "${opts.workspace}". Existing: ${all.map((w) => w.name).join(', ')}`);
    ws = found;
  } else if (all.length > 1) {
    fail(`There are ${all.length} workspaces. Pick one with --workspace: ${all.map((w) => `"${w.name}"`).join(', ')}`);
  }

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\nThis replaces the company profile, offerings, accounts, sources and background jobs in "${ws.name}" (${env}) with the "${profile.key}" profile.\nMembers and their passwords stay.`);
    const answer = await rl.question(`Type the workspace name to continue: `);
    rl.close();
    if (answer.trim().toLowerCase() !== ws.name.toLowerCase()) { console.log('Nothing changed.'); return; }
  }

  const { owner } = await loadProfile(ws.id, profile.key);
  console.log(`Loaded "${profile.title}" into ${ws.name} (${env}): ${profile.offerings.length} offerings, ${profile.accounts.length} accounts${owner ? `, owned by ${owner}` : ''}.`);
}

main().catch((e) => {
  console.error(`Error: ${explain(e, env)}`);
  process.exit(1);
});
