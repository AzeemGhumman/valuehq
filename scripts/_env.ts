// Shared by the command-line scripts: pick the environment (--env local|dev|prod) and point the AWS SDK at it.
// Must run before importing anything that reads config/.
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
    env = v;
    args.splice(i, 2);
  }
  process.env.APP_ENV = env;
  process.env.AWS_REGION ||= 'us-east-1';
  process.env.TABLE_NAME = `valuehq-${env}`;
  if (env === 'local') {
    process.env.DYNAMODB_ENDPOINT ||= 'http://localhost:8000';
  } else {
    delete process.env.DYNAMODB_ENDPOINT;
    process.env.AWS_PROFILE ||= 'personal';
  }
  return { env, args };
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
