import "server-only";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { applicationUserState, profiles } from "@/server/db/schema";
import { measurePageStage } from "@/server/observability/page-timing";
import { loadApplicationAccountContext } from "./context";

type PageSession = Parameters<typeof loadApplicationAccountContext>[0];

// Only used by the server-render account gate. Existing rows are read in one
// statement. Missing rows and legacy UNVERIFIED accounts go through the original
// conflict-safe initialization/state transition path; never invent permissions.
export async function loadPageApplicationAccountContext(session: PageSession) {
  const [existing] = await measurePageStage("account_join", async () =>
    await db.select({ accountState: applicationUserState, profile: profiles })
      .from(applicationUserState)
      .innerJoin(profiles, eq(applicationUserState.userId, profiles.userId))
      .where(eq(applicationUserState.userId, session.user.id))
      .limit(1),
  );
  if (!existing || existing.accountState.status === "UNVERIFIED") {
    return measurePageStage("account_fallback", () => loadApplicationAccountContext(session));
  }
  return { session, accountState: existing.accountState, profile: existing.profile };
}
