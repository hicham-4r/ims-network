import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { after } from "next/server";

import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/server/email";
import { serverEnv } from "@/server/env";

export const auth = betterAuth({
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      after(async () => {
        await sendVerificationEmail({
          to: user.email,
          verificationUrl: url,
        });
      });
    },

    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,

    sendResetPassword: async ({ user, url }) => {
      after(async () => {
        await sendPasswordResetEmail({
          to: user.email,
          resetUrl: url,
        });
      });
    },

    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },

  trustedOrigins: [
    serverEnv.BETTER_AUTH_URL,
  ],
});
