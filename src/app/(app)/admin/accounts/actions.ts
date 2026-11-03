"use server";

import { revalidatePath } from "next/cache";

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
}: {
  targetUserId: string;
  action: AdminAccountAction;
  reason?: string;
}) {
  try {
    await changeAccountState({
      targetUserId,
      action,
      reason,
    });

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
    targetUserId: getRequiredFormString(
      formData,
      "targetUserId",
    ),
    action: "RESTORE",
  });
}
