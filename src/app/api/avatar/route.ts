import { reportFailure } from "@/server/observability/safe-events";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireActiveMember } from "@/server/account-state";
import { AccountAccessError } from "@/server/account-state/errors";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { serverEnv } from "@/server/env";

import {
  AvatarConflictError,
  replaceOwnAvatar,
} from "@/server/avatar/service";
import {
  AvatarValidationError,
  MAX_AVATAR_BYTES,
} from "@/server/avatar/validation";

const MAX_REQUEST_BYTES = MAX_AVATAR_BYTES + 64 * 1024;

class RequestTooLargeError extends Error {}

async function readBoundedUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new AvatarValidationError("Invalid upload format.");
  }

  const declared = request.headers.get("content-length");

  if (declared !== null) {
    const length = Number(declared);

    if (!Number.isFinite(length) || length < 0 || length > MAX_REQUEST_BYTES) {
      throw new RequestTooLargeError();
    }
  }

  if (!request.body) {
    throw new AvatarValidationError("Missing upload body.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        throw new RequestTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const form = await new Response(body, {
      headers: { "content-type": contentType },
    }).formData();

    if (form.getAll("file").length !== 1) {
      throw new AvatarValidationError(
        "Select exactly one image.",
      );
    }

    return form.get("file");
  } catch (error) {
    if (error instanceof AvatarValidationError) {
      throw error;
    }

    throw new AvatarValidationError("Invalid multipart upload.");
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin || origin !== new URL(serverEnv.BETTER_AUTH_URL).origin) {
    return NextResponse.json(
      { error: "Upload origin not allowed." },
      { status: 403 },
    );
  }

  let member: Awaited<ReturnType<typeof requireActiveMember>>;

  try {
    member = await requireActiveMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof AccountAccessError) {
      return NextResponse.json(
        { error: "Active membership required." },
        { status: 403 },
      );
    }

    reportFailure("avatar_access_unavailable");
    return NextResponse.json({ error: "Upload temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const decision = await checkRateLimit("avatarUpload", member.session.user.id, "deny");
    if (!decision.allowed) {
      const unavailable = decision.reason === "unavailable";
      return NextResponse.json({ error: unavailable ? "Upload temporarily unavailable." : "Too many uploads. Try again later." }, {
        status: unavailable ? 503 : 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds ?? 30) },
      });
    }
    const file = await readBoundedUpload(request);

    if (file instanceof File && file.size > MAX_AVATAR_BYTES) {
      throw new RequestTooLargeError();
    }

    await replaceOwnAvatar(file, member);

    revalidatePath("/profile");
    revalidatePath("/members");

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json(
        { error: "Image exceeds the 2 MB upload limit." },
        { status: 413 },
      );
    }

    if (error instanceof AvatarValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    if (error instanceof AvatarConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }

    reportFailure("avatar_upload_failed");

    return NextResponse.json(
      { error: "Unable to save avatar. Please try again." },
      { status: 500 },
    );
  }
}
