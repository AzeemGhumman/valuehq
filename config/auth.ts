// Sign-in and session settings.
export const auth = {
  sessionCookie: 'vhq_session',
  sessionDays: 30,
  minPasswordLength: 10,
  // Secure cookies everywhere except local http development.
  secureCookies: (process.env.APP_ENV ?? 'local') !== 'local',
} as const;
