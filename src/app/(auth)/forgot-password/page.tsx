"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { TurnstileWidget, turnstileSiteKey } from "@/components/auth/turnstile-widget";
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending || (turnstileSiteKey && !captchaToken)) {
      return;
    }

    setErrorMessage(null);
    setIsPending(true);

    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
        fetchOptions: { headers: captchaToken ? { "x-captcha-response": captchaToken } : {} },
      });
      if (String(error?.code) === "CAPTCHA_REQUIRED" || error?.status === 429 || error?.status === 503) {
        setErrorMessage("Request could not be completed. Complete a new challenge and retry shortly.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setErrorMessage("Request could not be completed. Please retry shortly.");
    } finally {
      setCaptchaToken(null);
      setCaptchaAttempt(value => value + 1);
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Password reset by email is available only for previously verified addresses. If you registered without email verification, use a previously saved recovery code if available. Without one, contact the network owner; recovery is not guaranteed.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {submitted ? (
          <p
            className="text-sm leading-6 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            If this address is eligible for email recovery, a reset link has been requested. Otherwise, use a saved recovery code if available. This message does not confirm that an account exists.
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

            <TurnstileWidget key={captchaAttempt} action="recovery" onToken={setCaptchaToken} />
            {errorMessage ? <p role="alert" className="text-sm text-muted-foreground">{errorMessage}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || Boolean(turnstileSiteKey && !captchaToken)}
            >
              {isPending ? "Requesting..." : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm"><Link href="/recover-with-code" prefetch={false} className="underline">Use a saved recovery code instead</Link></p>
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
