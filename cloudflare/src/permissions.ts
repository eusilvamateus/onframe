export const PERMISSION_RESOURCES = {
  accounts: ['read', 'write', 'delete'],
  listings: ['read', 'write'],
  promotions: ['read', 'write', 'delete'],
  products: ['read', 'write', 'delete'],
  history: ['read'],
  settings: ['read', 'write']
} as const;

export type Permission = `${keyof typeof PERMISSION_RESOURCES}.${'read' | 'write' | 'delete'}`;

export type PermissionActor = {
  workspaceRole: 'admin' | 'collaborator';
  permissions?: string[];
};

export const ALL_PERMISSIONS = Object.entries(PERMISSION_RESOURCES).flatMap(([resource, actions]) =>
  actions.map((action) => `${resource}.${action}`)
);

export function hasPermission(actor: PermissionActor, permission: Permission): boolean {
  return actor.workspaceRole === 'admin' || actor.permissions?.includes(permission) === true;
}

export function validPermissions(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null;
  const permissions = [...new Set(value)];
  if (permissions.some((entry) => !ALL_PERMISSIONS.includes(entry))) return null;
  for (const permission of permissions) {
    const [resource, action] = permission.split('.');
    if (action !== 'read' && !permissions.includes(`${resource}.read`)) return null;
    if ((resource === 'listings' || resource === 'promotions') && !permissions.includes('accounts.read')) return null;
  }
  return permissions;
}
