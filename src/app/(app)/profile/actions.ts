"use server";

import { revalidatePath } from "next/cache";

import {
  ProfileUpdateError,
  profileUpdateSchema,
  updateOwnProfile,
} from "@/server/profile";

export type ProfileFormState = {
  ok: boolean;
  message: string;
  fieldErrors: {
    displayName?: string[];
    program?: string[];
    graduationYear?: string[];
    bio?: string[];
  };
};

export async function updateProfileAction(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const input = {
    displayName: formData.get("displayName"),
    program: formData.get("program"),
    graduationYear: formData.get("graduationYear"),
    bio: formData.get("bio"),
  };

  const parsed =
    profileUpdateSchema.safeParse(input);

  if (!parsed.success) {
    const flattened =
      parsed.error.flatten();

    return {
      ok: false,
      message:
        "Please correct the highlighted profile fields.",
      fieldErrors: {
        displayName:
          flattened.fieldErrors.displayName,
        program:
          flattened.fieldErrors.program,
        graduationYear:
          flattened.fieldErrors.graduationYear,
        bio:
          flattened.fieldErrors.bio,
      },
    };
  }

  try {
    await updateOwnProfile(parsed.data);

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/members");

    return {
      ok: true,
      message: "Profile saved successfully.",
      fieldErrors: {},
    };
  } catch (error) {
    if (error instanceof ProfileUpdateError) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: {},
      };
    }

    throw error;
  }
}
