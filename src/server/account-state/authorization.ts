import {
  requireAuthenticatedSession,
} from "@/server/auth";

import {
  loadApplicationAccountContext,
} from "./context";
import {
  AccountAccessError,
} from "./errors";

export async function requireApplicationAccount() {
  const session =
    await requireAuthenticatedSession();

  return loadApplicationAccountContext(
    session,
  );
}

export async function requireActiveMember() {
  const context =
    await requireApplicationAccount();

  if (
    context.accountState.status !== "ACTIVE"
  ) {
    throw new AccountAccessError({
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Active account required.",
      accountStatus:
        context.accountState.status,
      accountRole:
        context.accountState.role,
    });
  }

  return context;
}

export async function requireAdmin() {
  const context =
    await requireActiveMember();

  if (
    context.accountState.role !== "ADMIN"
  ) {
    throw new AccountAccessError({
      code: "ADMIN_REQUIRED",
      message:
        "Administrator access required.",
      accountStatus:
        context.accountState.status,
      accountRole:
        context.accountState.role,
    });
  }

  return context;
}
