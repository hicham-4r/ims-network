import type {
  getCurrentSession,
} from "@/server/auth";
import {
  ensureApplicationUserState,
} from "@/server/account-state/service";
import {
  ensureUserProfile,
} from "@/server/profile/ensure";

type ApplicationSession =
  NonNullable<
    Awaited<
      ReturnType<typeof getCurrentSession>
    >
  >;

export async function loadApplicationAccountContext(
  session: ApplicationSession,
) {
  const [
    accountState,
    profile,
  ] = await Promise.all([
    ensureApplicationUserState({
      id: session.user.id,
      emailVerified:
        session.user.emailVerified,
    }),

    ensureUserProfile({
      id: session.user.id,
      name: session.user.name,
    }),
  ]);

  return {
    session,
    accountState,
    profile,
  };
}
