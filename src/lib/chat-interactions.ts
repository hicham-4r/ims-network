export const REACTIONS = { like: "👍", love: "❤️", laugh: "😂", wow: "😮", sad: "😢", fire: "🔥" } as const;
export type Reaction = keyof typeof REACTIONS;
export function parseReaction(value: unknown): Reaction | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(REACTIONS, value) ? value as Reaction : null;
}
export function quotePreview(value: string) { return value.length > 160 ? `${value.slice(0, 160)}…` : value; }
