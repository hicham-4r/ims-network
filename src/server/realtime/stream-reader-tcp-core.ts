import { classifyRelayTcpFailure, relayDiagnostic } from "./relay-diagnostics";

import type {
  StreamReadClient,
  StreamReadFactory,
} from "./stream-reader-core";
import {
  RELAY_BATCH_SIZE,
  RELAY_BLOCK_MS,
} from "./relay-protocol";

const STREAM_KEY_PATTERN =
  /^ims-network:v1:(development|preview|production):realtime:events$/;
const STREAM_ID_PATTERN = /^(\$|[0-9]+-[0-9]+)$/;

export type TcpClientOptions = {
  lazyConnect: true;
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: 2;
  disableClientInfo: true;
  enableReadyCheck: false;
  enableOfflineQueue: true;
  tls: { servername: string; rejectUnauthorized: true };
  autoResendUnfulfilledCommands: false;
  maxRetriesPerRequest: 0;
  connectTimeout: 8000;
  commandTimeout: 35000;
  keepAlive: 10000;
  retryStrategy: () => null;
};

export type TcpClient = {
  connect(): Promise<void>;
  call(command: string, ...args: (string | number)[]): Promise<unknown>;
  disconnect(): void;
  onError(handler: (error: unknown) => void): void;
};

export type TcpClientFactory = (
  options: TcpClientOptions,
) => TcpClient;

// The raw URL is never logged, returned by an error, or printed in tests.
export function validateUpstashTlsUrl(value: string, expectedUsername = "default"): string {
  if (!value || value.length > 4096) {
    throw new Error("Missing or invalid Upstash TCP connection URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid Upstash TCP connection URL.");
  }

  if (
    parsed.protocol !== "rediss:" ||
    !parsed.hostname.endsWith(".upstash.io") ||
    parsed.hostname === ".upstash.io" ||
    parsed.username !== expectedUsername ||
    !parsed.password ||
    !parsed.port ||
    (parsed.pathname !== "" && parsed.pathname !== "/" && parsed.pathname !== "/0") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Upstash TCP URL must use approved TLS format.");
  }

  try {
    decodeURIComponent(parsed.password);
  } catch {
    throw new Error("Invalid Upstash TCP credential encoding.");
  }
  return value;
}

function createOptions(redisUrl: string): TcpClientOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    // Match the verified minimal Upstash TCP initialization. No optional
    // HELLO/CLIENT SETINFO/INFO negotiation is needed for this stream reader.
    protocol: 2,
    disableClientInfo: true,
    enableReadyCheck: false,
    tls: { servername: parsed.hostname, rejectUnauthorized: true },
    lazyConnect: true,
    // The client may queue initialization commands, but application XREAD
    // is gated on ready in the adapter. No automatic retry or resend.
    enableOfflineQueue: true,
    autoResendUnfulfilledCommands: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 8000,
    commandTimeout: 35000,
    keepAlive: 10000,
    retryStrategy: () => null,
  };
}

// No TCP connection is opened until the SharedStreamReader calls this factory.
// The SharedStreamReader itself owns when to start and stop the connection.
export function createTlsStreamReadFactory(
  redisUrl: string,
  clientFactory: TcpClientFactory,
  expectedUsername = "default",
): StreamReadFactory {
  const validatedUrl = validateUpstashTlsUrl(redisUrl, expectedUsername);

  return async (): Promise<StreamReadClient> => {
    const client = clientFactory(createOptions(validatedUrl));
    // Suppress ioredis's default unhandled-error printing. The reader core
    // retries with backoff; never log credentials or private identifiers.
    client.onError(error => relayDiagnostic(classifyRelayTcpFailure(error)));

    try {
      await client.connect();
      relayDiagnostic("relay_tcp_connected");
    } catch (error) {
      relayDiagnostic(classifyRelayTcpFailure(error));
      client.disconnect();
      throw new Error("Realtime Redis TCP connection failed.");
    }

    let closed = false;

    return {
      async read(streamKey, afterId, blockMs, count) {
        if (closed) {
          throw new Error("Realtime Redis reader already closed.");
        }
        if (
          !STREAM_KEY_PATTERN.test(streamKey) ||
          !STREAM_ID_PATTERN.test(afterId) ||
          blockMs !== RELAY_BLOCK_MS ||
          count !== RELAY_BATCH_SIZE
        ) {
          throw new Error("Invalid bounded Redis Stream read.");
        }

        return client.call(
          "XREAD",
          "COUNT", count,
          "BLOCK", blockMs,
          "STREAMS", streamKey, afterId,
        );
      },
      disconnect() {
        if (closed) return;
        closed = true;
        client.disconnect();
      },
    };
  };
}
