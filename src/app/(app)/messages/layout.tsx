import { Suspense, type ReactNode } from "react";

import { requireActiveMemberPage } from "@/server/account-state/routing";

import { isRelayActive } from "@/server/realtime/relay-activation-policy";
import { redisKeyPrefix } from "@/server/redis/client";

import { MessageRealtimeListener } from "./realtime-client";

/** Only /messages mounts the realtime client. Server gating costs no Redis calls. */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="ims-empty" role="status">Loading messaging…</p>}><AuthorizedMessages>{children}</AuthorizedMessages></Suspense>;
}
async function AuthorizedMessages({ children }: { children: ReactNode }) {
  await requireActiveMemberPage();

  const realtimeEnabled = isRelayActive(process.env, redisKeyPrefix);

  return (
    <>
      {realtimeEnabled ? <MessageRealtimeListener /> : null}
      {children}
    </>
  );
}
