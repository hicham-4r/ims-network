"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    setIsPending(true);
    setMessage(null);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: "/sign-in",
      });
    } finally {
      setMessage(
        "If an account exists for that email, a verification message has been requested.",
      );
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          Verify your email address before signing in to IMS Network.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          We sent a verification link during registration. The link expires
          after one hour.
        </p>

        <form className="space-y-5" onSubmit={handleResend}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="verification-email">
                Email address
              </FieldLabel>

              <Input
                id="verification-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isPending}
                required
              />

              <FieldDescription>
                Enter your email if you need another verification link.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={isPending}
          >
            {isPending ? "Requesting..." : "Resend verification email"}
          </Button>

          {message ? (
            <p
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
