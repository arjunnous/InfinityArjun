// File: utils/rbac.ts

export type Role = 'admin' | 'underwriter' | 'agent' | 'viewer';

export type Resource = 'policy' | 'product' | 'rule' | 'rating-table' | 'user';

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'endorse'
  | 'renew'
  | 'cancel'
  | 'publish'
  | 'configure'
  | 'evaluate'
  | 'manage';

type PermissionMatrix = Record<Role, Partial<Record<Resource, Action[]>>>;

// ---------------------------------------------------------------------------
// Permission matrix — single source of truth for what each role can do
// ---------------------------------------------------------------------------
const PERMISSIONS: PermissionMatrix = {
  admin: {
    policy:         ['create', 'read', 'update', 'delete', 'endorse', 'renew', 'cancel'],
    product:        ['create', 'read', 'update', 'delete', 'configure', 'publish'],
    rule:           ['create', 'read', 'update', 'delete', 'evaluate'],
    'rating-table': ['create', 'read', 'update', 'delete'],
    user:           ['create', 'read', 'update', 'delete', 'manage'],
  },
  underwriter: {
    policy:         ['create', 'read', 'update', 'endorse', 'renew', 'cancel'],
    product:        ['read'],
    rule:           ['read', 'evaluate'],
    'rating-table': ['read'],
    user:           [],
  },
  agent: {
    policy:         ['create', 'read'],
    product:        [],
    rule:           [],
    'rating-table': [],
    user:           [],
  },
  viewer: {
    policy:         ['read'],
    product:        ['read'],
    rule:           ['read'],
    'rating-table': ['read'],
    user:           [],
  },
};

/** Return all allowed actions for a role on every resource. */
export function getRolePermissions(role: Role): Partial<Record<Resource, Action[]>> {
  return PERMISSIONS[role] ?? {};
}

/** Check whether a role may perform an action on a resource. */
export function hasPermission(role: Role, resource: Resource, action: Action): boolean {
  return (PERMISSIONS[role]?.[resource] ?? []).includes(action);
}

/**
 * Assert permission — throws an RBAC error if the role is not allowed.
 * Use in helpers before performing sensitive operations.
 */
export function assertPermission(role: Role, resource: Resource, action: Action): void {
  if (!hasPermission(role, resource, action)) {
    throw new Error(
      `[RBAC] Role "${role}" cannot perform "${action}" on "${resource}".`,
    );
  }
}

/** File path where global-setup stores each role's browser auth state. */
export const AUTH_STORAGE_PATH: Record<Role, string> = {
  admin:       '.auth/admin.json',
  underwriter: '.auth/underwriter.json',
  agent:       '.auth/agent.json',
  viewer:      '.auth/viewer.json',
};

/** Display label used in Allure / log output. */
export const ROLE_LABEL: Record<Role, string> = {
  admin:       'Administrator',
  underwriter: 'Underwriter',
  agent:       'Agent / Broker',
  viewer:      'Read-Only Viewer',
};
