// Sign-in and session settings.
export const auth = {
  sessionCookie: 'vhq_session',
  sessionDays: 30,
  // Kept short on purpose for the demo. Raise it before real customers sign in.
  minPasswordLength: 4,
  // Secure cookies everywhere except local http development.
  secureCookies: (process.env.APP_ENV ?? 'local') !== 'local',
} as const;
