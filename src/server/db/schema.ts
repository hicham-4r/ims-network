import { pgEnum } from "drizzle-orm/pg-core";

export const accountStatus = pgEnum("account_status", [
  "UNVERIFIED",
  "PENDING_APPROVAL",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
]);

export const accountRole = pgEnum("account_role", [
  "MEMBER",
  "ADMIN",
]);
