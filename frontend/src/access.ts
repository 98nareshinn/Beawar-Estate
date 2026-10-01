import type { Page, Role, User } from './types.ts';
const roles: Record<string, Role[]> = {
  approve: ['admin', 'approver'],
  review_documents: ['admin'],
  manage_agents: ['admin', 'team'],
  manage_content: ['admin', 'team'],
  manage_services: ['admin', 'team'],
};
export function hasPermission(user: User | null | undefined, permission: string) {
  return !!user && user.active && (user.role === 'head_admin' || !!roles[permission]?.includes(user.role) && user.permissions.includes(permission));
}
export function canOpenPage(user: User | null | undefined, page: Page) {
  if (page === 'chat') return !!user?.active;
  if (page === 'agents') return hasPermission(user, 'manage_agents');
  if (page === 'approvals') return hasPermission(user, 'approve') || hasPermission(user, 'review_documents');
  if (page === 'admin') return !!user?.active && user.role === 'head_admin';
  if (page === 'settings') return !!user?.active;
  return true;
}
