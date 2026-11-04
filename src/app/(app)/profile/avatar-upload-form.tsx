"use client";

import {
  type FormEvent,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { MemberAvatar } from "@/components/members/member-avatar";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  version: string;
};

const MAX_BYTES = 2 * 1024 * 1024;

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function AvatarUploadForm({
  userId,
  displayName,
  hasAvatar,
  version,
}: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleUpload(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (uploading) return;

    setMessage("");
    setSuccess(false);

    const file = fileInput.current?.files?.[0];

    if (!file) {
      setMessage("Please select an image.");
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setMessage("Choose a JPEG, PNG or WebP image.");
      return;
    }

    if (file.size === 0 || file.size > MAX_BYTES) {
      setMessage("Image must be smaller than 2 MB.");
      return;
    }

    setUploading(true);

    try {
      const data = new FormData();
      data.append("file", file);

      const response = await fetch("/api/avatar", {
        method: "POST",
        body: data,
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json() as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        setMessage(
          result.error ?? "Avatar upload failed.",
        );
        return;
      }

      if (fileInput.current) {
        fileInput.current.value = "";
      }

      setSuccess(true);
      setMessage("Profile picture updated successfully.");

      router.refresh();
    } catch {
      setMessage(
        "Unable to upload the image. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mb-8 space-y-5 border-b pb-8">
      <div className="flex items-center gap-4">
        <MemberAvatar
          userId={userId}
          displayName={displayName}
          hasAvatar={hasAvatar}
          version={version}
          size="lg"
        />

        <div>
          <h3 className="font-semibold">
            Profile picture
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your photo will be visible to active
            ESITH IMS Network members.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleUpload}
        className="space-y-4"
      >
        <div className="space-y-2">
          <label
            htmlFor="avatar-file"
            className="text-sm font-medium"
          >
            Select a profile picture
          </label>

          <input
            ref={fileInput}
            id="avatar-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            required
            className="block w-full rounded-md border bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
          />

          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP. Maximum 2 MB.
            Images are resized automatically.
          </p>
        </div>

        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={
              success
                ? "text-sm text-primary"
                : "text-sm text-destructive"
            }
          >
            {message}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={uploading}
        >
          {uploading
            ? "Uploading..."
            : hasAvatar
              ? "Replace picture"
              : "Upload picture"}
        </Button>
      </form>
    </section>
  );
}
