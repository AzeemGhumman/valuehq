// Manage who can sign in.
//
//   npm run users -- list                                   [--env local|dev|prod]
//   npm run users -- add <email> --name "Full Name"        [--role admin|member] [--password <pw>] [--workspace "Comena"]
//   npm run users -- remove <email>
//   npm run users -- reset-password <email>                 [--password <pw>]
//
// --env defaults to local. dev and prod use your AWS profile (AWS_PROFILE, default "personal").
import { options, useEnv } from './_env';

const HELP = `Manage ValueHQ users

  npm run users -- list [--env local|dev|prod]
  npm run users -- add <email> --name "Full Name" [--role admin|member] [--password <pw>] [--workspace "Comena"] [--env ...]
  npm run users -- remove <email> [--env ...]
  npm run users -- reset-password <email> [--password <pw>] [--env ...]

Without --password, a password is generated and printed once.
The first user creates the workspace (named by --workspace, default "Comena").`;

const { env, args } = useEnv(process.argv.slice(2));
const [command, ...rest] = args;
if (!command || command === 'help' || command === '--help') { console.log(HELP); process.exit(0); }

async function main() {
const { users, workspaces } = await import('../src/server/repo');
const { hashPassword, randomPassword } = await import('../src/server/password');
const { auth } = await import('../config/auth');

function fail(msg: string): never { console.error(`Error: ${msg}`); process.exit(1); }
async function pickWorkspace(name?: string, create = false) {
  const all = await workspaces.list();
  if (name) {
    const w = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (w) return w;
    if (create) return workspaces.create(name);
    fail(`No workspace named "${name}". Existing: ${all.map((x) => x.name).join(', ') || 'none'}`);
  }
  if (all.length > 0) return all[0];
  if (create) return workspaces.create('Comena');
  fail('No workspace yet. Add the first user with `npm run users -- add`.');
}

try {
  switch (command) {
    case 'list': {
      const ws = await workspaces.list();
      if (ws.length === 0) { console.log(`No users in ${env}.`); break; }
      for (const w of ws) {
        const list = await users.list(w.id);
        console.log(`\n${w.name} (${env}) · ${list.length} user${list.length === 1 ? '' : 's'}`);
        for (const u of list.sort((a, b) => a.email.localeCompare(b.email))) console.log(`  ${u.email.padEnd(34)} ${u.name.padEnd(22)} ${u.role}`);
      }
      console.log('');
      break;
    }
    case 'add': {
      const { opts, rest: pos } = options(rest, ['name', 'role', 'password', 'workspace']);
      const email = pos[0]?.toLowerCase();
      if (!email || !email.includes('@')) fail('Give an email: npm run users -- add you@company.com --name "Your Name"');
      if (typeof opts.name !== 'string') fail('Give a name with --name "Full Name"');
      if (await users.get(email)) fail(`${email} already exists. Use reset-password to change their password.`);
      const role = opts.role === 'admin' ? 'admin' : 'member';
      const password = typeof opts.password === 'string' ? opts.password : randomPassword();
      if (password.length < auth.minPasswordLength) fail(`Passwords need at least ${auth.minPasswordLength} characters.`);
      const w = await pickWorkspace(typeof opts.workspace === 'string' ? opts.workspace : undefined, true);
      await users.put({ email, name: opts.name, role, passwordHash: hashPassword(password), workspaceId: w.id, createdAt: new Date().toISOString() });
      console.log(`Added ${email} (${role}) to ${w.name} in ${env}.`);
      if (typeof opts.password !== 'string') console.log(`Password: ${password}\nShare it privately. They can change it in Settings.`);
      break;
    }
    case 'remove': {
      const email = rest[0]?.toLowerCase();
      if (!email) fail('Give an email: npm run users -- remove someone@company.com');
      if (!(await users.get(email))) fail(`${email} not found in ${env}.`);
      await users.remove(email);
      console.log(`Removed ${email} from ${env}. They are signed out on their next page load.`);
      break;
    }
    case 'reset-password': {
      const { opts, rest: pos } = options(rest, ['password']);
      const email = pos[0]?.toLowerCase();
      if (!email) fail('Give an email: npm run users -- reset-password someone@company.com');
      const u = await users.get(email);
      if (!u) fail(`${email} not found in ${env}.`);
      const password = typeof opts.password === 'string' ? opts.password : randomPassword();
      if (password.length < auth.minPasswordLength) fail(`Passwords need at least ${auth.minPasswordLength} characters.`);
      await users.put({ ...u, passwordHash: hashPassword(password) });
      console.log(`New password for ${email} in ${env}${typeof opts.password === 'string' ? ' saved.' : `: ${password}`}`);
      break;
    }
    default:
      fail(`Unknown command "${command}".\n\n${HELP}`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/ResourceNotFound/.test(msg) || /Cannot do operations on a non-existent table/.test(msg)) fail(`The ${env} table doesn't exist yet. ${env === 'local' ? 'Run `npm run db:local` first.' : `Deploy ${env} first.`}`);
  if (/ECONNREFUSED/.test(msg)) fail('Local DynamoDB isn’t running. Start it with `npm run db:local`.');
  if (/credentials|ExpiredToken|security token/i.test(msg)) fail(`AWS credentials not found or expired for profile "${process.env.AWS_PROFILE}". Sign in with \`aws sso login --profile ${process.env.AWS_PROFILE}\` or check ~/.aws.`);
  fail(msg);
}
}

void main();
