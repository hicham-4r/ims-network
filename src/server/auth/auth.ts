import { reportFailure } from "@/server/observability/safe-events";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { after } from "next/server";

import { db } from "@/server/db";
import { createPendingAccountState } from "@/server/account-state/service";
import * as schema from "@/server/db/schema";
import { sendPasswordResetEmail } from "@/server/email";
import { serverEnv } from "@/server/env";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,

  // Framework errors may contain SQL parameters (including session tokens).
  // Discard all message/argument data, even in Preview and Development.
  logger: {
    level: "warn",
    log: (level) => {
      if (level === "error") reportFailure("auth_internal_error");
      else if (level === "warn") reportFailure("auth_internal_warning");
    },
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  // New registrations always begin as MEMBER/PENDING_APPROVAL.
  // This hook runs after Better Auth creates the user, even if the
  // user does not establish a session after registration.
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await createPendingAccountState(createdUser.id);
        },
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    // Prevents email ownership checks AND retains generic registration
    // behavior for an email that was previously registered.
    requireEmailVerification: false,
    autoSignIn: false,

    sendResetPassword: async ({ user, url }) => {
      // Registration does not prove mailbox ownership. Do not let an unproven
      // email address become an account-recovery credential. Legacy verified
      // addresses retain the existing reset flow. Keep the response generic.
      if (user.emailVerified !== true) return;
      after(async () => {
        try {
          await sendPasswordResetEmail({ to: user.email, resetUrl: url });
        } catch {
          // Provider exceptions may contain request details; never log them or reset URLs.
          reportFailure("password_reset_delivery_failed");
        }
      });
    },

    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },

  session: { cookieCache: { enabled: false } },

  trustedOrigins: [
    serverEnv.BETTER_AUTH_URL,
  ],
});
