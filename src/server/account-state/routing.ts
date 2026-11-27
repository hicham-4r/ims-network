import { redirect } from "next/navigation";
import { cache } from "react";

import { measurePageStage } from "@/server/observability/page-timing";

import { getCurrentSession } from "@/server/auth";
import type {
  AccountStatus,
} from "@/server/db/schema";

import { loadPageApplicationAccountContext } from "./page-context";

// React cache is scoped to the current server render, never shared across
// requests. Keep mutation/API authorization on the separate uncached helpers.
export const getApplicationPageAccount = cache(async function getApplicationPageAccount() {
  const session = await measurePageStage("session", getCurrentSession);

  if (!session) {
    redirect("/sign-in");
  }

  return loadPageApplicationAccountContext(session);
});

export function redirectRestrictedAccount(
  status: AccountStatus,
) {
  switch (status) {
    case "UNVERIFIED":
      redirect("/pending-approval");

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

export async function requireActiveMemberPage() {
  const context = await getApplicationPageAccount();
  redirectRestrictedAccount(context.accountState.status);
  return context;
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
