import "server-only";
import { parseOwnerId, isOwner, displayRole, type RoleSubject } from "./owner-policy";

// No fallback to email, first registered user, or first administrator.
export function configuredOwnerId(): string | null {
  return parseOwnerId(process.env.IMS_OWNER_USER_ID);
}
export function isConfiguredOwner(subject: RoleSubject): boolean {
  return isOwner(configuredOwnerId(), subject);
}
export function applicationRoleLabel(subject: RoleSubject) {
  return displayRole(configuredOwnerId(), subject);
}
