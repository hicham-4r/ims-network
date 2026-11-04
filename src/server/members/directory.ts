import {
  and,
  asc,
  eq,
  gt,
  like,
  or,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";

import { requireActiveMember } from "@/server/account-state";
import { db } from "@/server/db";
import {
  applicationUserState,
  profiles,
} from "@/server/db/schema";
import { normalizeSearchText } from "@/server/profile/normalize";

export const MEMBER_PAGE_SIZE = 12;

const directoryInputSchema = z.object({
  q: z.string().max(80).optional(),
  year: z.string().max(4).optional(),
  cursor: z.string().max(1024).optional(),
});

const cursorSchema = z.object({
  v: z.literal(1),
  q: z.string().max(80),
  year: z.number().int().nullable(),
  name: z.string().max(256),
  id: z.string().min(1).max(255),
}).strict();

type DirectoryCursor = z.infer<typeof cursorSchema>;

export type DirectoryInput = {
  q?: string;
  year?: string;
  cursor?: string;
};

export class InvalidDirectoryQueryError extends Error {
  constructor() {
    super("Invalid member-directory filters or cursor.");
    this.name = "InvalidDirectoryQueryError";
  }
}

function decodeCursor(
  raw: string,
  q: string,
  year: number | null,
): DirectoryCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
      throw new Error("Invalid encoding");
    }

    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );

    const result = cursorSchema.safeParse(decoded);

    if (
      !result.success ||
      result.data.q !== q ||
      result.data.year !== year
    ) {
      throw new Error("Invalid cursor");
    }

    return result.data;
  } catch {
    throw new InvalidDirectoryQueryError();
  }
}

function encodeCursor(cursor: DirectoryCursor) {
  return Buffer.from(
    JSON.stringify(cursor),
    "utf8",
  ).toString("base64url");
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listActiveMembers(
  input: DirectoryInput,
) {
  // Authentication and account authorization happen first.
  await requireActiveMember();

  const parsed = directoryInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new InvalidDirectoryQueryError();
  }

  const q = normalizeSearchText(parsed.data.q ?? "");

  if (q.length > 80) {
    throw new InvalidDirectoryQueryError();
  }

  const rawYear = parsed.data.year?.trim() ?? "";

  let year: number | null = null;

  if (rawYear) {
    year = Number(rawYear);

    if (
      !/^\d{4}$/.test(rawYear) ||
      !Number.isInteger(year) ||
      year < 1950 ||
      year > new Date().getUTCFullYear() + 10
    ) {
      throw new InvalidDirectoryQueryError();
    }
  }

  const cursor = parsed.data.cursor
    ? decodeCursor(parsed.data.cursor, q, year)
    : null;

  const conditions: SQL[] = [
    eq(applicationUserState.status, "ACTIVE"),
  ];

  if (q) {
    const prefix = `${escapeLike(q)}%`;

    const searchCondition = or(
      like(profiles.displayNameSearch, prefix),
      like(profiles.programSearch, prefix),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (year !== null) {
    conditions.push(
      eq(profiles.graduationYear, year),
    );
  }

  if (cursor) {
    const cursorCondition = or(
      gt(profiles.displayNameSearch, cursor.name),
      and(
        eq(profiles.displayNameSearch, cursor.name),
        gt(profiles.userId, cursor.id),
      ),
    );

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }
  }

  const rows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      displayNameSearch: profiles.displayNameSearch,
      program: profiles.program,
      graduationYear: profiles.graduationYear,
      bio: profiles.bio,
      avatarUrl: profiles.avatarUrl,
      avatarUpdatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .innerJoin(
      applicationUserState,
      eq(
        applicationUserState.userId,
        profiles.userId,
      ),
    )
    .where(and(...conditions))
    .orderBy(
      asc(profiles.displayNameSearch),
      asc(profiles.userId),
    )
    .limit(MEMBER_PAGE_SIZE + 1);

  const hasMore = rows.length > MEMBER_PAGE_SIZE;

  const members = rows
    .slice(0, MEMBER_PAGE_SIZE)
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      program: row.program,
      graduationYear: row.graduationYear,
      bio: row.bio,
        hasAvatar: Boolean(row.avatarUrl),
        avatarVersion: row.avatarUpdatedAt.toISOString(),
    }));

  const lastVisibleRow =
    rows[Math.min(rows.length, MEMBER_PAGE_SIZE) - 1];

  const nextCursor =
    hasMore && lastVisibleRow
      ? encodeCursor({
          v: 1,
          q,
          year,
          name: lastVisibleRow.displayNameSearch,
          id: lastVisibleRow.userId,
        })
      : null;

  return {
    members,
    nextCursor,
    q,
    year,
  };
}
