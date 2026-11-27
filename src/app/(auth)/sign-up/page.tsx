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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function SignUpPage() {

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsPending(true);

    try {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { headers: captchaToken ? { "x-captcha-response": captchaToken } : {} },
      });

      if (error) {
        setErrorMessage(
          "Account creation could not be completed. Please check your details.",
        );
        return;
      }

      // A generic confirmation also avoids revealing whether an email
      // already belongs to another account.
      setPassword("");
      setConfirmPassword("");
      setSubmitted(true);
    } catch {
      setErrorMessage(
        "Account creation could not be completed. Please try again.",
      );
    } finally {
      setCaptchaToken(null);
      setCaptchaAttempt(value => value + 1);
      setIsPending(false);
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registration request received</CardTitle>
          <CardDescription role="status">
            If a new account was created, it is awaiting administrator approval.
            You can sign in to check its status; no email verification is needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Continue to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Apply to join the ESITH IMS alumni network.
          An administrator reviews accounts before access.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">
                Full name
              </FieldLabel>

              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={100}
                disabled={isPending}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">
                Email address
              </FieldLabel>

              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isPending}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">
                Password
              </FieldLabel>

              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                disabled={isPending}
                required
              />

              <FieldDescription>
                Use at least 8 characters.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm password
              </FieldLabel>

              <Input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                disabled={isPending}
                required
              />

              {errorMessage ? (
                <FieldDescription
                  role="alert"
                  aria-live="polite"
                >
                  {errorMessage}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>

          <TurnstileWidget key={captchaAttempt} action="signup" onToken={setCaptchaToken} />
          <Button
            type="submit"
            className="w-full"
            disabled={isPending || Boolean(turnstileSiteKey && !captchaToken)}
          >
            {isPending ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
