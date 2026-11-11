// ─────────────────────────────────────────────────────────────────────────────
// ROLES AND PERMISSIONS: the single place that decides who can do what.
//
// To change a rule, edit PERMISSIONS below. Every server action checks these rules
// (src/server/permissions.ts), and Settings › Roles shows them to everyone.
//
// Scopes:
//   'any'  can do it to every item in the workspace
//   'own'  only to accounts they own or are on the team of
//   (not listed) cannot do it
//
// `adjustable: true` lets admins change that rule for members and viewers in
// Settings › Roles, per workspace. Admin rules are never adjustable.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  admin: { label: 'Admin', description: 'Runs the workspace: company profile, offerings, value maps, members and settings. Can do everything.' },
  member: { label: 'Member', description: 'Works accounts: adds accounts, researches them and runs jobs. Reads the company profile and offerings.' },
  viewer: { label: 'Viewer', description: 'Read-only. Sees everything in the workspace but changes nothing except their own profile.' },
} as const;

export type Role = keyof typeof ROLES;
export type Scope = 'any' | 'own';
export const ROLE_ORDER: Role[] = ['admin', 'member', 'viewer'];

export interface PermissionRule {
  label: string;
  group: 'Company' | 'Offerings' | 'Accounts' | 'Background jobs' | 'Workspace';
  grants: Partial<Record<Role, Scope>>;
  adjustable?: boolean;
}

export const PERMISSIONS = {
  // Company
  'company.edit': { group: 'Company', label: 'Edit the company profile and company-wide sources', grants: { admin: 'any' } },

  // Offerings
  'offerings.manage': { group: 'Offerings', label: 'Create, duplicate and delete offerings', grants: { admin: 'any' } },
  'offerings.edit': { group: 'Offerings', label: 'Edit offering details and offering sources', grants: { admin: 'any' }, adjustable: true },
  'valuemap.edit': { group: 'Offerings', label: 'Edit value map rows and mark them reviewed', grants: { admin: 'any' }, adjustable: true },

  // Accounts
  'accounts.create': { group: 'Accounts', label: 'Add accounts', grants: { admin: 'any', member: 'any' }, adjustable: true },
  'accounts.edit': { group: 'Accounts', label: 'Edit account details and account sources', grants: { admin: 'any', member: 'any' }, adjustable: true },
  'accounts.assign': { group: 'Accounts', label: 'Change an account’s owner and team', grants: { admin: 'any', member: 'own' }, adjustable: true },
  'accounts.delete': { group: 'Accounts', label: 'Delete accounts', grants: { admin: 'any', member: 'own' }, adjustable: true },

  // Background jobs
  'jobs.run': { group: 'Background jobs', label: 'Start background jobs (they use workspace credits)', grants: { admin: 'any', member: 'any' }, adjustable: true },

  // Workspace
  'members.manage': { group: 'Workspace', label: 'Add and remove members, change their roles', grants: { admin: 'any' } },
  'workspace.settings': { group: 'Workspace', label: 'Rename the workspace and change adjustable rules', grants: { admin: 'any' } },
} as const satisfies Record<string, PermissionRule>;

export type Permission = keyof typeof PERMISSIONS;

// Per-workspace changes to adjustable rules, saved by admins in Settings › Roles.
// 'none' removes the permission for that role.
export type GrantOverrides = Partial<Record<Permission, Partial<Record<Exclude<Role, 'admin'>, Scope | 'none'>>>>;

// The effective scope of a permission for a role, after workspace overrides.
export function scopeFor(permission: Permission, role: Role, overrides?: GrantOverrides): Scope | null {
  const rule: PermissionRule = PERMISSIONS[permission];
  if (role !== 'admin' && rule.adjustable) {
    const o = overrides?.[permission]?.[role];
    if (o) return o === 'none' ? null : o;
  }
  return rule.grants[role] ?? null;
}

export const isRole = (v: unknown): v is Role => typeof v === 'string' && v in ROLES;

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM OPERATORS: the ValueHQ team, above every workspace.
//
// Operators are users with `isOperator: true`. They live in the internal "ValueHQ Platform"
// workspace and get the admin console at /admin. Create the first one from the command line:
//   npm run users -- add you@valuehq.com --name "You" --operator
//
// What operators can do (enforced by requireOperator() in src/server/auth.ts):
// ─────────────────────────────────────────────────────────────────────────────
export const OPERATOR = {
  label: 'Platform operator',
  can: [
    'See every org, with its members, status and background jobs',
    'Provision an org: company, website and sources, first admin, optional sample data',
    'Start a background job that reads the company’s website and sources and drafts its profile',
    'Open any org as its admin (every action there is recorded under the operator’s email)',
    'Rename, disable, enable and delete orgs; load a sample profile into an org',
    'Add, remove, disable and enable people in any org; set their role, email and password',
    'Add and remove other operators',
  ],
  // Disabled people and people in disabled orgs can't sign in. Operators always can.
} as const;
