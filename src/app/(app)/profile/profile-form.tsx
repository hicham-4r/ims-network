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
    jobTitle: string | null;
    company: string | null;
    location: string | null;
    skills: string | null;
    mentorship: string | null;

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

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-sm font-semibold">Professional details</legend>
        <p className="text-sm text-muted-foreground">Optional information visible to active alumni. Avoid private addresses or contact details.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 min-w-0"><label htmlFor="jobTitle" className="text-sm font-medium">Job title</label><Input id="jobTitle" name="jobTitle" maxLength={120} defaultValue={profile.jobTitle ?? ""} disabled={isPending}/><FieldError messages={state.fieldErrors.jobTitle}/></div>
          <div className="space-y-2 min-w-0"><label htmlFor="company" className="text-sm font-medium">Company</label><Input id="company" name="company" maxLength={120} defaultValue={profile.company ?? ""} disabled={isPending}/><FieldError messages={state.fieldErrors.company}/></div>
          <div className="space-y-2 min-w-0"><label htmlFor="location" className="text-sm font-medium">Location</label><Input id="location" name="location" maxLength={120} defaultValue={profile.location ?? ""} disabled={isPending}/><FieldError messages={state.fieldErrors.location}/></div>
          <div className="space-y-2 min-w-0"><label htmlFor="skills" className="text-sm font-medium">Skills</label><Input id="skills" name="skills" maxLength={240} defaultValue={profile.skills ?? ""} disabled={isPending}/><FieldError messages={state.fieldErrors.skills}/></div>
        </div>
        <div className="space-y-2"><label htmlFor="mentorship" className="text-sm font-medium">Mentorship</label><select className="w-full rounded-md border bg-background p-2 text-sm" id="mentorship" name="mentorship" defaultValue={profile.mentorship ?? ""} disabled={isPending}><option value="">Not specified</option><option value="open">Open to mentor</option><option value="seeking">Seeking a mentor</option><option value="unavailable">Not available</option></select><FieldError messages={state.fieldErrors.mentorship}/></div>
      </fieldset>

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
