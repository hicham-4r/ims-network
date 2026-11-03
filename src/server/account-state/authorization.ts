import {
  ensureApplicationUserState,
} from "./service";

import {
  requireAuthenticatedSession,
} from "@/server/auth";
import {
  AccountAccessError,
} from "./errors";

export async function requireApplicationAccount() {
  const session = await requireAuthenticatedSession();

  const accountState =
    await ensureApplicationUserState({
      id: session.user.id,
      emailVerified: session.user.emailVerified,
    });

  return {
    session,
    accountState,
  };
}

export async function requireActiveMember() {
  const {
    session,
    accountState,
  } = await requireApplicationAccount();

  if (accountState.status !== "ACTIVE") {
    throw new AccountAccessError({
      code: "ACCOUNT_NOT_ACTIVE",
      message: "Active account required.",
      accountStatus: accountState.status,
      accountRole: accountState.role,
    });
  }

  return {
    session,
    accountState,
  };
}

export async function requireAdmin() {
  const {
    session,
    accountState,
  } = await requireActiveMember();

  if (accountState.role !== "ADMIN") {
    throw new AccountAccessError({
      code: "ADMIN_REQUIRED",
      message: "Administrator access required.",
      accountStatus: accountState.status,
      accountRole: accountState.role,
    });
  }

  return {
    session,
    accountState,
  };
}
