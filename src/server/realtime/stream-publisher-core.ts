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
// Publication is Preview-only; an unexpected Redis namespace fails closed.
export type RelayPublishEnvironment = Readonly<{
  VERCEL_ENV?: string;
  IMS_PHASE16_WS_ENABLED?: string;
  IMS_PHASE16_RELAY_ENABLED?: string;
}>;

export function isPreviewRelayPublishEnabled(
  env: RelayPublishEnvironment,
): boolean {
  return (
    env.VERCEL_ENV === "preview" &&
    env.IMS_PHASE16_WS_ENABLED === "true" &&
    env.IMS_PHASE16_RELAY_ENABLED === "true"
  );
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
    !isPreviewRelayPublishEnabled(env) ||
    !append ||
    input.prefix !== "ims-network:v1:preview"
  ) {
    return false;
  }

  await appendRelayNotice(append, input);
  return true;
}
