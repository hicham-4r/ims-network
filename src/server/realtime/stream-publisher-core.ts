import { isRelayActive, type RelayActivationEnv } from "./relay-activation-policy";
import {
  createRelayEntry,
  RELAY_MAXLEN,
} from "./relay-protocol";

export type StreamAppend = (
  key: string,
  id: "*",
  fields: Record<string, string>,
  options: {
    trim: {
      type: "MAXLEN";
      threshold: number;
      comparison: "~";
    };
  },
) => Promise<string>;

export type RelayInput =
  Parameters<typeof createRelayEntry>[0];

// Exactly one bounded XADD command per notification.
// This function has no database or network dependencies
// except the explicitly provided append function.
export async function appendRelayNotice(
  append: StreamAppend,
  input: RelayInput,
): Promise<string> {
  const entry = createRelayEntry(input);

  const streamId = await append(
    entry.streamKey,
    "*",
    { ...entry.fields },
    {
      trim: {
        type: "MAXLEN",
        threshold: RELAY_MAXLEN,
        comparison: "~",
      },
    },
  );

  if (
    typeof streamId !== "string" ||
    !/^[0-9]+-[0-9]+$/.test(streamId)
  ) {
    throw new Error("Invalid Redis Stream response.");
  }

  return streamId;
}
// A separate relay flag prevents Redis writes during WS-only smoke tests.
// Publication uses the shared environment policy; wrong namespaces fail closed.
export type RelayPublishEnvironment = RelayActivationEnv;

export function isPreviewRelayPublishEnabled(
  env: RelayPublishEnvironment,
): boolean {
  return isRelayActive(env, "ims-network:v1:preview");
}

/**
 * Purely gated append boundary. Disabled => no XADD, no input validation
 * side effects, and no Redis dependency. Exceptions propagate to the
 * best-effort adapter, which handles them without failing message storage.
 */
export async function appendRelayNoticeIfEnabled(
  env: RelayPublishEnvironment,
  append: StreamAppend | null,
  input: RelayInput,
): Promise<boolean> {
  if (
    !isRelayActive(env, input.prefix) ||
    !append
  ) {
    return false;
  }

  await appendRelayNotice(append, input);
  return true;
}
