import type { RateLimitBackend } from "./rate-limit-core";

// Fixed-window Preview allowances are no greater than the existing Redis budgets.
// For sliding-window policies use half the allowance to bound cross-window bursts.
export const previewLimits = {
  privacyExport: [20, 600], privacyDeletion: [5, 600], recoveryCode: [5, 600], passwordChange: [5, 600],
  ownerRole: [2, 600], avatarUpload: [5, 600], adminModeration: [30, 300],
  auth: [45, 600], signup: [12, 1800], recovery: [10, 900],
  memberSearch: [40, 60], profileEdit: [12, 600], messageReport: [5, 600],
  chatActivity: [8, 60], messageDelivery: [30, 60], messageReaction: [20, 60],
  messageSend: [10, 60], conversationOpen: [10, 300], conversationInbox: [30, 60],
  messageHistory: [45, 60], messageRead: [30, 60],
} as const satisfies Record<string, readonly [number, number]>;

export type PreviewLimitKind = keyof typeof previewLimits;
export type PreviewIncrement = (key: string, limit: number, seconds: number) => Promise<boolean>;

export function createPreviewLimiter(kind: PreviewLimitKind, increment: PreviewIncrement): RateLimitBackend {
  const [limit, seconds] = previewLimits[kind];
  return { async limit(identifier) {
    if (!/^[a-f0-9]{64}$/.test(identifier)) throw new Error("Invalid Preview rate-limit digest.");
    const success = await increment(`${kind}:${identifier}`, limit, seconds);
    if (typeof success !== "boolean") throw new Error("Invalid Preview limiter response.");
    return { success, reset: Date.now() + seconds * 1000 };
  } };
}
