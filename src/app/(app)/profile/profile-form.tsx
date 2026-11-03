"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  updateProfileAction,
  type ProfileFormState,
} from "./actions";

const initialProfileFormState: ProfileFormState = {
  ok: false,
  message: "",
  fieldErrors: {},
};

type ProfileFormProps = {
  profile: {
    displayName: string;
    program: string | null;
    graduationYear: number | null;
    bio: string | null;
  };
};

function FieldError({
  messages,
}: {
  messages?: string[];
}) {
  if (!messages?.length) {
    return null;
  }

  return (
    <p
      className="text-sm text-destructive"
      role="alert"
    >
      {messages[0]}
    </p>
  );
}

export function ProfileForm({
  profile,
}: ProfileFormProps) {
  const [
    state,
    formAction,
    isPending,
  ] = useActionState(
    updateProfileAction,
    initialProfileFormState,
  );

  return (
    <form
      action={formAction}
      className="space-y-6"
    >
      <div className="space-y-2">
        <label
          htmlFor="displayName"
          className="text-sm font-medium"
        >
          Display name
        </label>

        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          defaultValue={profile.displayName}
          minLength={2}
          maxLength={80}
          disabled={isPending}
          required
        />

        <FieldError
          messages={
            state.fieldErrors.displayName
          }
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="program"
            className="text-sm font-medium"
          >
            Program
          </label>

          <Input
            id="program"
            name="program"
            type="text"
            defaultValue={profile.program ?? ""}
            maxLength={120}
            disabled={isPending}
            placeholder="IMS"
          />

          <FieldError messages={state.fieldErrors.program} />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="graduationYear"
            className="text-sm font-medium"
          >
            Graduation year
          </label>

          <Input
            id="graduationYear"
            name="graduationYear"
            type="number"
            min={1950}
            max={new Date().getFullYear() + 10}
            defaultValue={profile.graduationYear ?? ""}
            disabled={isPending}
          />

          <FieldError messages={state.fieldErrors.graduationYear} />
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="bio"
          className="text-sm font-medium"
        >
          Bio
        </label>

        <textarea
          id="bio"
          name="bio"
          maxLength={1000}
          defaultValue={profile.bio ?? ""}
          disabled={isPending}
          placeholder="Introduce yourself to fellow ESITH IMS alumni."
          className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-start justify-between gap-4">
          <FieldError
            messages={
              state.fieldErrors.bio
            }
          />

          <span className="ml-auto text-xs text-muted-foreground">
            Maximum 1000 characters
          </span>
        </div>
      </div>

      {state.message ? (
        <p
          className={
            state.ok
              ? "text-sm text-primary"
              : "text-sm text-destructive"
          }
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
      >
        {isPending
          ? "Saving..."
          : "Save profile"}
      </Button>
    </form>
  );
}
