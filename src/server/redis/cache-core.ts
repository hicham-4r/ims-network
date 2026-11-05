import type { z } from "zod";

export type CacheBackend = {
  get<T>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    options: { ex: number },
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

type CacheOptions<T> = {
  backend: CacheBackend | null;
  key: string;
  ttlSeconds: number;
  schema: z.ZodType<T>;
  loader: () => Promise<T>;
};

export async function readThroughCache<T>({
  backend,
  key,
  ttlSeconds,
  schema,
  loader,
}: CacheOptions<T>): Promise<T> {
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 600
  ) {
    throw new Error("Invalid cache TTL.");
  }

  if (backend) {
    try {
      const cached = await backend.get<unknown>(key);

      if (cached !== null) {
        const parsed = schema.safeParse(cached);

        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Redis is optional for cached reads.
      // The authoritative loader is still required.
    }
  }

  const fresh = schema.parse(await loader());

  if (backend) {
    try {
      await backend.set(key, fresh, {
        ex: ttlSeconds,
      });
    } catch {
      // A cache-write failure cannot change the
      // result of a successful authoritative read.
    }
  }

  return fresh;
}

export async function invalidateCachedKey(
  backend: CacheBackend | null,
  key: string,
): Promise<boolean> {
  if (!backend) {
    return false;
  }

  try {
    await backend.del(key);
    return true;
  } catch {
    // Callers must not assume invalidation succeeded.
    return false;
  }
}