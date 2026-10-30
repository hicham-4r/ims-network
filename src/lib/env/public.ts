/**
 * Browser-safe environment configuration.
 *
 * No client-exposed environment variables are currently required.
 *
 * Future values must be intentionally reviewed before being exposed through
 * NEXT_PUBLIC_ variables.
 */
export const publicEnv = {} as const;

export type PublicEnv = typeof publicEnv;
