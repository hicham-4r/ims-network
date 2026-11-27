import "server-only";

import Redis from "ioredis";

import {
  createTlsStreamReadFactory,
} from "./stream-reader-tcp-core";

// Keep the credential in server-side environment only.
// This factory is not called until we deliberately wire the shared reader.
export function createConfiguredTcpReaderFactory() {
  const url = process.env.UPSTASH_REDIS_TCP_URL;
  if (!url) {
    throw new Error("Realtime Redis TCP URL is not configured.");
  }

  return createTlsStreamReadFactory(url, (options) => {
    const client = new Redis(options);
    return {
      connect: () => client.connect(),
      call: (command, ...args) => {
        // Never queue application commands during disconnection. The shared
        // stream reader owns its bounded retry/backoff policy.
        if (client.status !== "ready") {
          return Promise.reject(new Error("Realtime Redis TCP client is not ready."));
        }
        return client.call(command, ...args);
      },
      disconnect: () => client.disconnect(),
      onError: (handler) => { client.on("error", handler); },
    };
  });
}
