import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";

const AVATAR_PATH_PATTERN =
  /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

export function isManagedAvatarPath(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    AVATAR_PATH_PATTERN.test(value)
  );
}

export async function uploadPrivateAvatar(
  image: Buffer,
): Promise<string> {
  const pathname = `avatars/${randomUUID()}.webp`;

  const blob = await put(pathname, image, {
    access: "private",
    contentType: "image/webp",
    addRandomSuffix: false,
  });

  if (!isManagedAvatarPath(blob.pathname)) {
    throw new Error("Unexpected avatar storage path.");
  }

  return blob.pathname;
}

export async function deletePrivateAvatar(
  pathname: string | null,
): Promise<void> {
  if (!isManagedAvatarPath(pathname)) {
    return;
  }

  await del(pathname);
}
