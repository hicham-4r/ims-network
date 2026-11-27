"use server";

import { revalidatePath, updateTag } from "next/cache";

import { ADMIN_METRICS_TAG } from "@/server/account-state/admin-metrics";
import { isConfirmed } from "@/server/account-state/admin-query";

import {
  AdminAccountMutationError,
  changeAccountState,
  type AdminAccountAction,
} from "@/server/account-state";

function getRequiredFormString(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new AdminAccountMutationError(
      "Invalid account-management request.",
    );
  }

  return value.trim();
}

async function performAction({
  targetUserId,
  action,
  reason,
  confirmed,
}: {
  targetUserId: string;
  action: AdminAccountAction;
  reason?: string;
  confirmed: boolean;
}) {
  try {
    await changeAccountState({
      targetUserId,
      action,
      reason,
      confirmed,
    });

    updateTag(ADMIN_METRICS_TAG);
    revalidatePath("/admin");
    revalidatePath("/admin/audit");
    revalidatePath("/admin/accounts/[id]", "page");

    revalidatePath("/admin/accounts");
    revalidatePath("/dashboard");
  } catch (error) {
    if (
      error instanceof AdminAccountMutationError
    ) {
      throw new Error(error.message);
    }

    throw error;
  }
}

export async function approveAccount(
  formData: FormData,
) {
  await performAction({
    confirmed: isConfirmed(formData.get("confirmed")),
    targetUserId: getRequiredFormString(
      formData,
      "targetUserId",
    ),
    action: "APPROVE",
  });
}

export async function rejectAccount(
  formData: FormData,
) {
  await performAction({
    confirmed: isConfirmed(formData.get("confirmed")),
    targetUserId: getRequiredFormString(
      formData,
      "targetUserId",
    ),

    action: "REJECT",

    reason: getRequiredFormString(
      formData,
      "reason",
    ),
  });
}

export async function suspendAccount(
  formData: FormData,
) {
  await performAction({
    confirmed: isConfirmed(formData.get("confirmed")),
    targetUserId: getRequiredFormString(
      formData,
      "targetUserId",
    ),

    action: "SUSPEND",

    reason: getRequiredFormString(
      formData,
      "reason",
    ),
  });
}

export async function restoreAccount(
  formData: FormData,
) {
  await performAction({
    confirmed: isConfirmed(formData.get("confirmed")),
    targetUserId: getRequiredFormString(
      formData,
      "targetUserId",
    ),
    action: "RESTORE",
  });
}
