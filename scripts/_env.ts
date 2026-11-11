// Shared by the command-line scripts: pick the environment (--env local|dev|prod) and point the AWS SDK at it.
// Must run before importing anything that reads config/ (config/account.ts reads no env, so it's safe).
import { awsAccount } from '../config/account';

export type CliEnv = 'local' | 'dev' | 'prod';

export function useEnv(argv: string[]): { env: CliEnv; args: string[] } {
  const args = [...argv];
  let env: CliEnv = 'local';
  const i = args.indexOf('--env');
  if (i !== -1) {
    const v = args[i + 1];
    if (v !== 'local' && v !== 'dev' && v !== 'prod') {
      console.error('--env must be local, dev or prod');
      process.exit(1);
    }
    env = v as CliEnv;
    args.splice(i, 2);
  }
  process.env.APP_ENV = env;
  process.env.AWS_REGION ||= 'us-east-1';
  process.env.TABLE_NAME = `valuehq-${env}`;
  if (env === 'local') {
    process.env.DYNAMODB_ENDPOINT ||= 'http://localhost:8000';
  } else {
    delete process.env.DYNAMODB_ENDPOINT;
    // Only the profile in config/account.ts: keys or another profile in the shell would win otherwise.
    for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_DEFAULT_PROFILE']) delete process.env[k];
    process.env.AWS_PROFILE = awsAccount.profile;
  }
  return { env, args };
}

// For dev and prod: stops unless the credentials belong to the account pinned in config/account.ts.
// Reads the account from the table's ARN, so it needs no extra permissions.
export async function checkAccount(env: CliEnv) {
  if (env === 'local') return;
  const { DynamoDBClient, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  const { Table } = await client.send(new DescribeTableCommand({ TableName: process.env.TABLE_NAME }));
  const account = Table?.TableArn?.split(':')[4];
  if (!awsAccount.accountId) {
    console.error(`Profile "${awsAccount.profile}" is AWS account ${account}. Pin it first: set accountId: '${account}' in config/account.ts.`);
    process.exit(1);
  }
  if (account !== awsAccount.accountId) {
    console.error(`Stopped: profile "${awsAccount.profile}" is AWS account ${account}, but config/account.ts pins ${awsAccount.accountId}.`);
    process.exit(1);
  }
}

// Reads --name value style options; returns the remaining positional arguments.
export function options(args: string[], names: string[]) {
  const opts: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (!names.includes(key)) { console.error(`Unknown option ${a}`); process.exit(1); }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; } else opts[key] = true;
    } else rest.push(a);
  }
  return { opts, rest };
}

// Turns AWS SDK and connection errors into a plain-language line.
export function explain(e: unknown, env: CliEnv): string {
  const err = e as { name?: string; code?: string; message?: string; errors?: { code?: string }[] };
  const text = `${err?.name ?? ''} ${err?.code ?? ''} ${err?.message ?? ''} ${(err?.errors ?? []).map((x) => x.code).join(' ')}`;
  if (/ECONNREFUSED/.test(text)) {
    return env === 'local'
      ? 'Local DynamoDB isn’t running on http://localhost:8000. Start Docker Desktop, then run `npm run db:local`.'
      : 'Could not connect to AWS. Check your network.';
  }
  if (/ResourceNotFound|non-existent table/.test(text)) {
    return env === 'local' ? 'The local table doesn’t exist yet. Run `npm run db:local`.' : `The ${env} table doesn’t exist yet. Deploy ${env} first.`;
  }
  if (/credential|ExpiredToken|security token|CredentialsProviderError/i.test(text)) {
    return `AWS credentials not found or expired for profile "${process.env.AWS_PROFILE}". Run \`aws sso login --profile ${process.env.AWS_PROFILE}\` or check ~/.aws.`;
  }
  return err?.message || err?.name || String(e);
}

// Asks for a password in the terminal without showing it. Asks twice to catch typos.
export async function askPassword(min: number): Promise<string> {
  const read = (question: string) => new Promise<string>((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = '';
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(value); return;
        }
        if (ch === '\u0003') { stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
        value += ch;
      }
    };
    stdin.setRawMode?.(true); stdin.resume(); stdin.on('data', onData);
  });
  for (;;) {
    const first = await read('Password: ');
    if (first.length < min) { console.log(`Use at least ${min} characters.`); continue; }
    const second = await read('Type it again: ');
    if (first === second) return first;
    console.log('Those didn’t match. Try again.');
  }
}
