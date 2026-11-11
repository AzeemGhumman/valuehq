// Manage who can sign in.
//
//   npm run users -- list                                   [--env local|dev|prod]
//   npm run users -- add <email> --name "Full Name"        [--role admin|member|viewer] [--password <pw>] [--workspace "Comena"]
//   (without --password it asks you to type one)
//   npm run users -- remove <email>
//   npm run users -- reset-password <email>                 [--password <pw>]
//   npm run users -- set-role <email> <admin|member|viewer>
//   npm run users -- disable <email>      /  enable <email>     (turn someone's sign-in off or on)
//   npm run users -- add <email> --name "Full Name" --operator  (a ValueHQ platform operator: gets /admin)
//   npm run users -- set-operator <email> <on|off>
//
// What each role can do is defined in config/roles.ts.
//
// --env defaults to local. dev and prod always use the profile and account in config/account.ts.
import { askPassword, checkAccount, explain, options, useEnv } from './_env';
import { ROLES, isRole } from '../config/roles';

const HELP = `Manage ValueHQ users

  npm run users -- list [--env local|dev|prod]
  npm run users -- add <email> --name "Full Name" [--role admin|member|viewer] [--password <pw>] [--workspace "Comena"] [--env ...]
  npm run users -- remove <email> [--env ...]
  npm run users -- reset-password <email> [--password <pw>] [--env ...]
  npm run users -- set-role <email> <admin|member|viewer> [--env ...]
  npm run users -- disable <email> | enable <email> [--env ...]

Platform operators (the ValueHQ team; they get the admin console at /admin):
  npm run users -- add <email> --name "Full Name" [--password <pw>] --operator
  npm run users -- set-operator <email> <on|off>

Without --password, you're asked to type one (hidden). Minimum length is set in config/auth.ts.
The first user creates the workspace (named by --workspace, default "Comena").`;

const { env, args } = useEnv(process.argv.slice(2));
const [command, ...rest] = args;
if (!command || command === 'help' || command === '--help') { console.log(HELP); process.exit(0); }

async function main() {
const { sessions, users, workspaces } = await import('../src/server/repo');
const { hashPassword } = await import('../src/server/password');
const { auth } = await import('../config/auth');

function fail(msg: string): never { console.error(`Error: ${msg}`); process.exit(1); }
async function pickWorkspace(name?: string, create = false) {
  const all = (await workspaces.list()).filter((x) => x.kind !== 'internal');
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
  await checkAccount(env);
  switch (command) {
    case 'list': {
      const ws = await workspaces.list();
      if (ws.length === 0) { console.log(`No users in ${env}.`); break; }
      for (const w of ws) {
        const list = await users.list(w.id);
        const tags = [w.kind === 'internal' ? 'platform team' : '', w.status === 'disabled' ? 'DISABLED' : ''].filter(Boolean).join(', ');
        console.log(`\n${w.name}${tags ? ` [${tags}]` : ''} (${env}) · ${list.length} user${list.length === 1 ? '' : 's'}`);
        for (const u of list.sort((a, b) => a.email.localeCompare(b.email))) {
          console.log(`  ${u.email.padEnd(34)} ${u.name.padEnd(22)} ${u.isOperator ? 'operator' : u.role}${u.disabled ? '  (sign-in off)' : ''}`);
        }
      }
      console.log('');
      break;
    }
    case 'add': {
      const { opts, rest: pos } = options(rest, ['name', 'role', 'password', 'workspace', 'operator']);
      const email = pos[0]?.toLowerCase();
      if (!email || !email.includes('@')) fail('Give an email: npm run users -- add you@company.com --name "Your Name"');
      if (typeof opts.name !== 'string') fail('Give a name with --name "Full Name"');
      if (await users.get(email)) fail(`${email} already exists. Use reset-password to change their password.`);
      if (opts.role !== undefined && !isRole(opts.role)) fail(`--role must be one of: ${Object.keys(ROLES).join(', ')}`);
      const role = isRole(opts.role) ? opts.role : 'member';
      const password = typeof opts.password === 'string' ? opts.password : await askPassword(auth.minPasswordLength);
      if (password.length < auth.minPasswordLength) fail(`Passwords need at least ${auth.minPasswordLength} characters.`);
      if (opts.operator === true || opts.operator === 'true') {
        const w = await workspaces.internal();
        await users.put({ email, name: opts.name, role: 'admin', isOperator: true, passwordHash: hashPassword(password), workspaceId: w.id, createdAt: new Date().toISOString() });
        console.log(`Added platform operator ${email} (${env}). Sign in and go to /admin.`);
        break;
      }
      const w = await pickWorkspace(typeof opts.workspace === 'string' ? opts.workspace : undefined, true);
      // The first person in a workspace is always an admin, so someone can manage it.
      const first = (await users.list(w.id)).length === 0;
      if (first && role !== 'admin') console.log('First person in this workspace: making them an admin.');
      await users.put({ email, name: opts.name, role: first ? 'admin' : role, passwordHash: hashPassword(password), workspaceId: w.id, createdAt: new Date().toISOString() });
      console.log(`Added ${email} (${first ? 'admin' : role}) to ${w.name} in ${env}.`);
      break;
    }
    case 'remove': {
      const email = rest[0]?.toLowerCase();
      if (!email) fail('Give an email: npm run users -- remove someone@company.com');
      if (!(await users.get(email))) fail(`${email} not found in ${env}.`);
      await users.remove(email);
      await sessions.removeFor(email);
      console.log(`Removed ${email} from ${env}. They're signed out.`);
      break;
    }
    case 'reset-password': {
      const { opts, rest: pos } = options(rest, ['password']);
      const email = pos[0]?.toLowerCase();
      if (!email) fail('Give an email: npm run users -- reset-password someone@company.com');
      const u = await users.get(email);
      if (!u) fail(`${email} not found in ${env}.`);
      const password = typeof opts.password === 'string' ? opts.password : await askPassword(auth.minPasswordLength);
      if (password.length < auth.minPasswordLength) fail(`Passwords need at least ${auth.minPasswordLength} characters.`);
      await users.put({ ...u, passwordHash: hashPassword(password) });
      console.log(`New password saved for ${email} in ${env}.`);
      break;
    }
    case 'set-role': {
      const [emailArg, role] = rest;
      const email = emailArg?.toLowerCase();
      if (!email || !isRole(role)) fail(`Usage: npm run users -- set-role <email> <${Object.keys(ROLES).join('|')}>`);
      const u = await users.get(email);
      if (!u) fail(`${email} not found in ${env}.`);
      if (u.role === 'admin' && role !== 'admin') {
        const admins = (await users.list(u.workspaceId)).filter((x) => x.role === 'admin');
        if (admins.length <= 1) fail('A workspace needs at least one admin. Make someone else an admin first.');
      }
      await users.put({ ...u, role });
      console.log(`${email} is now ${ROLES[role].label} in ${env}.`);
      break;
    }
    case 'disable':
    case 'enable': {
      const email = rest[0]?.toLowerCase();
      if (!email) fail(`Give an email: npm run users -- ${command} someone@company.com`);
      const u = await users.get(email);
      if (!u) fail(`${email} not found in ${env}.`);
      const off = command === 'disable';
      await users.put({ ...u, disabled: off || undefined });
      if (off) await sessions.removeFor(email);
      console.log(off ? `${email} can't sign in any more (${env}). Their data stays. Undo with: npm run users -- enable ${email}` : `${email} can sign in again (${env}).`);
      break;
    }
    case 'set-operator': {
      const [emailArg, value] = rest;
      const email = emailArg?.toLowerCase();
      if (!email || !['on', 'off'].includes(value)) fail('Usage: npm run users -- set-operator <email> <on|off>');
      const u = await users.get(email);
      if (!u) fail(`${email} not found in ${env}.`);
      if (value === 'on') {
        // Operators live in the internal workspace, so they aren't counted as members of a customer org.
        const internal = await workspaces.internal();
        if (u.workspaceId !== internal.id) console.log(`Moving ${email} out of their workspace into ${internal.name}.`);
        await users.put({ ...u, isOperator: true, role: 'admin', workspaceId: internal.id });
        console.log(`${email} is now a platform operator (${env}). They get /admin.`);
      } else {
        await users.put({ ...u, isOperator: undefined });
        console.log(`${email} is no longer an operator (${env}). They stay in the platform team workspace; move them with remove + add.`);
      }
      await sessions.removeFor(email);
      break;
    }
    default:
      fail(`Unknown command "${command}".\n\n${HELP}`);
  }
} catch (e) {
  fail(explain(e, env));
}
}

void main();
