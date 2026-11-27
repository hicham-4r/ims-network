"use server";
import { revalidatePath } from "next/cache";
import { changeAdministratorRole, OwnerRoleError } from "@/server/account-state/owner-admin";
import { isConfirmed } from "@/server/account-state/admin-query";

export async function changeRoleAction(_previous: { message: string }, formData: FormData): Promise<{ message: string }> {
  let target: string;
  try {
    const result = await changeAdministratorRole({ targetUserId: formData.get("targetUserId"), action: formData.get("action"),
      confirmed: isConfirmed(formData.get("confirmed")), password: formData.get("password") });
    target = result.userId;
  } catch (error) {
    return { message: error instanceof OwnerRoleError ? error.message : "Role change failed or access was denied. Refresh and try again." };
  }
  revalidatePath("/admin/accounts");
  revalidatePath(`/admin/accounts/${target}`);
  revalidatePath("/admin/audit");
  return { message: "Role changed. The target must sign in again." };
}
