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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    setIsPending(true);

    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } finally {
      setSubmitted(true);
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Request a secure password reset link.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {submitted ? (
          <p
            className="text-sm leading-6 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            If an account exists for that email address, a password reset
            message has been requested.
          </p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">
                  Email address
                </FieldLabel>

                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isPending}
                  required
                />
              </Field>
            </FieldGroup>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
            >
              {isPending ? "Requesting..." : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
