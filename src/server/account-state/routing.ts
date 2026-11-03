import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth";
import type {
  AccountStatus,
} from "@/server/db/schema";

import {
  loadApplicationAccountContext,
} from "./context";

export async function getApplicationPageAccount() {
  const session =
    await getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  return loadApplicationAccountContext(
    session,
  );
}

export function redirectRestrictedAccount(
  status: AccountStatus,
) {
  switch (status) {
    case "UNVERIFIED":
      redirect("/verify-email");

    case "PENDING_APPROVAL":
      redirect("/pending-approval");

    case "REJECTED":
      redirect("/account-rejected");

    case "SUSPENDED":
      redirect("/account-suspended");

    case "ACTIVE":
      return;
  }
}

export async function requireAccountStatusPage(
  expectedStatus: AccountStatus,
) {
  const context =
    await getApplicationPageAccount();

  if (
    context.accountState.status ===
    expectedStatus
  ) {
    return context;
  }

  if (
    context.accountState.status ===
    "ACTIVE"
  ) {
    redirect("/dashboard");
  }

  redirectRestrictedAccount(
    context.accountState.status,
  );

  return context;
}

export async function requireAdminPage() {
  const context =
    await getApplicationPageAccount();

  redirectRestrictedAccount(
    context.accountState.status,
  );

  if (
    context.accountState.role !==
    "ADMIN"
  ) {
    redirect("/dashboard");
  }

  return context;
}
