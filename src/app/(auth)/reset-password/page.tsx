"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

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

export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const resetToken = params.get("token");
    const resetError = params.get("error");

    if (resetToken && !resetError) {
      window.history.replaceState(
        null,
        "",
        "/reset-password",
      );
    }

    queueMicrotask(() => {
      if (resetError || !resetToken) {
        setErrorMessage(
          "This password reset link is invalid or has expired.",
        );
      } else {
        setToken(resetToken);
      }

      setIsReady(true);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || isPending) {
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (error) {
        setErrorMessage(
          "This password reset link is invalid or has expired.",
        );
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch {
      setErrorMessage(
        "Password reset could not be completed. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            Validating your reset link...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Set a new password for your IMS Network account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {token ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-password">
                  New password
                </FieldLabel>

                <Input
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  disabled={isPending}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm new password
                </FieldLabel>

                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
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

            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
            >
              {isPending ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        ) : (
          <>
            <p
              className="text-sm text-muted-foreground"
              role="alert"
            >
              {errorMessage}
            </p>

            <Button
              type="button"
              className="w-full"
              onClick={() => router.push("/forgot-password")}
            >
              Request a new reset link
            </Button>
          </>
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
