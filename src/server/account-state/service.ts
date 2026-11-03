import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/server/db";
import {
  applicationUserState,
  type AccountStatus,
} from "@/server/db/schema";

type AuthenticatedUserIdentity = {
  id: string;
  emailVerified: boolean;
};

export async function ensureApplicationUserState(
  user: AuthenticatedUserIdentity,
) {
  const initialStatus: AccountStatus =
    user.emailVerified
      ? "PENDING_APPROVAL"
      : "UNVERIFIED";

  await db
    .insert(applicationUserState)
    .values({
      userId: user.id,
      status: initialStatus,
      role: "MEMBER",
    })
    .onConflictDoNothing({
      target: applicationUserState.userId,
    });

  let [state] = await db
    .select()
    .from(applicationUserState)
    .where(
      eq(
        applicationUserState.userId,
        user.id,
      ),
    )
    .limit(1);

  if (!state) {
    throw new Error(
      "Application account state could not be loaded.",
    );
  }

  if (
    user.emailVerified &&
    state.status === "UNVERIFIED"
  ) {
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
