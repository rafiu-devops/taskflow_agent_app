import type { AgentUser } from "@/types/agent";

export function hasPermission(user: AgentUser | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.permissions?.[permission]);
}

export function hasAnyPermission(user: AgentUser | null | undefined, permissions: readonly string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function isActiveEmployee(user: AgentUser | null | undefined): boolean {
  return Boolean(user);
}
