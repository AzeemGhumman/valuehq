// App-wide settings. Every value can come from the environment; defaults suit local development.
export type AppEnv = 'local' | 'dev' | 'prod';

const env = (process.env.APP_ENV ?? 'local') as AppEnv;

export const app = {
  name: 'ValueHQ',
  env,
  isLocal: env === 'local',
  // Secret header CloudFront adds to every request; requests without it are refused (see src/middleware.ts).
  originVerify: process.env.ORIGIN_VERIFY ?? '',
} as const;
