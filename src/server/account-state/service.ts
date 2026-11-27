import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/server/db";
import {
  applicationUserState,
} from "@/server/db/schema";

type AuthenticatedUserIdentity = {
  id: string;
};

// Called by Better Auth's user.create.after and as a login-time fallback.
// Never updates an existing account status, role or administrative action.
export async function createPendingAccountState(userId: string) {
  await db
    .insert(applicationUserState)
    .values({
      userId,
      status: "PENDING_APPROVAL",
      role: "MEMBER",
    })
    .onConflictDoNothing({
      target: applicationUserState.userId,
    });
}

export async function ensureApplicationUserState(
  user: AuthenticatedUserIdentity,
) {
  const load = async () => {
    const [state] = await db.select().from(applicationUserState)
      .where(eq(applicationUserState.userId, user.id)).limit(1);
    return state;
  };
  // Established members need only a read. Missing rows still use the
  // conflict-safe registration fallback, then read the authoritative state.
  let state = await load();
  if (!state) {
    await createPendingAccountState(user.id);
    state = await load();
  }

  if (!state) {
    throw new Error(
      "Application account state could not be loaded.",
    );
  }

  // Old accounts created before this change may still have the legacy
  // UNVERIFIED status; move only those accounts to admin review.
  // ACTIVE, REJECTED and SUSPENDED must never change here.
  if (state.status === "UNVERIFIED") {
    const [updatedState] = await db
      .update(applicationUserState)
      .set({
        status: "PENDING_APPROVAL",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            applicationUserState.userId,
            user.id,
          ),
          eq(
            applicationUserState.status,
            "UNVERIFIED",
          ),
        ),
      )
      .returning();

    if (updatedState) {
      state = updatedState;
    } else {
      const [currentState] = await db
        .select()
        .from(applicationUserState)
        .where(
          eq(
            applicationUserState.userId,
            user.id,
          ),
        )
        .limit(1);

      if (!currentState) {
        throw new Error(
          "Application account state could not be reloaded.",
        );
      }

      state = currentState;
    }
  }

  return state;
}
