import { reportFailure } from "@/server/observability/safe-events";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { AccountAccessError } from "@/server/account-state/errors";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { getVisibleAvatarPath } from "@/server/avatar/read";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const privateHeaders = {
  "Cache-Control": "private, no-cache",
  "X-Content-Type-Options": "nosniff",
};

const errorHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  let pathname: string | null;

  try {
    // This service checks ACTIVE viewer and ACTIVE target.
    pathname = await getVisibleAvatarPath(id);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return new NextResponse("Authentication required", { status: 401, headers: errorHeaders });
    }
    if (error instanceof AccountAccessError) {
      return new NextResponse("Active membership required", {
        status: 403,
        headers: errorHeaders,
      });
    }

    reportFailure("avatar_access_unavailable");
    return new NextResponse("Avatar temporarily unavailable", { status: 503, headers: errorHeaders });
  }

  if (!pathname) {
    return new NextResponse("Not found", {
      status: 404,
      headers: errorHeaders,
    });
  }

  const result = await get(pathname, {
    access: "private",
    ifNoneMatch:
      request.headers.get("if-none-match") ?? undefined,
  }).catch(() => {
    reportFailure("avatar_read_failed");
    return undefined;
  });

  if (result === undefined) {
    return new NextResponse("Avatar temporarily unavailable", { status: 503, headers: errorHeaders });
  }

  if (!result) {
    return new NextResponse("Not found", {
      status: 404,
      headers: errorHeaders,
    });
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ...privateHeaders,
        ETag: result.blob.etag,
      },
    });
  }

  if (result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", {
      status: 404,
      headers: errorHeaders,
    });
  }

  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      ...privateHeaders,
      "Content-Type": "image/webp",
      ETag: result.blob.etag,
    },
  });
}
