import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountAccessError } from "@/server/account-state/errors";
import { redirectRestrictedAccount } from "@/server/account-state/routing";
import { AuthenticationRequiredError } from "@/server/auth/session";
import { MemberDirectoryTable } from "@/components/members/member-directory-table";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InvalidDirectoryQueryError,
  listActiveMembers,
} from "@/server/members";
import { MemberDirectoryRateLimitError } from "@/server/members/search-rate-limit";

type SearchParams = {
  q?: string | string[];
  year?: string | string[];
  cursor?: string | string[];
  mentorship?: string | string[];
  chat?: string | string[];
};

function firstString(
  value: string | string[] | undefined,
) {
  return typeof value === "string" ? value : undefined;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const input = {
    q: firstString(params.q),
    year: firstString(params.year),
    cursor: firstString(params.cursor),
    mentorship: firstString(params.mentorship),
  };

  const result = await listActiveMembers(input).catch(
    (error: unknown) => {
      if (error instanceof InvalidDirectoryQueryError) {
        return null;
      }

      if (error instanceof MemberDirectoryRateLimitError) {
        return {
          rateLimited: true as const,
          retryAfterSeconds: error.retryAfterSeconds,
          unavailable: error.unavailable,
        };
      }

      if (error instanceof AuthenticationRequiredError) {
        redirect("/sign-in");
      }

      if (
        error instanceof AccountAccessError &&
        error.code === "ACCOUNT_NOT_ACTIVE"
      ) {
        redirectRestrictedAccount(error.accountStatus);
      }

      // Unexpected errors (including database failures)
      // must remain visible to error monitoring.
      throw error;
    },
  );

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid directory search</CardTitle>
          <CardDescription>
            The search filters or page cursor are invalid.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link prefetch={false}
            href="/members"
            className="text-sm font-medium underline"
          >
            Clear filters
          </Link>
        </CardContent>
      </Card>
    );
  }

  if ("rateLimited" in result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {result.unavailable
              ? "Directory temporarily unavailable"
              : "Too many directory requests"}
          </CardTitle>
          <CardDescription>
            {result.unavailable
              ? "Please try again shortly."
              : `Please try again in ${result.retryAfterSeconds} seconds.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link prefetch={false} href="/dashboard" className="underline">
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  const chatUnavailable =
    firstString(params.chat) === "unavailable";

  const nextParams = new URLSearchParams();

  if (result.q) {
    nextParams.set("q", result.q);
  }

  if (result.year !== null) {
    nextParams.set("year", String(result.year));
  }

  if (result.mentorship) nextParams.set("mentorship", result.mentorship);

  if (result.nextCursor) {
    nextParams.set("cursor", result.nextCursor);
  }

  return (
    <div className="space-y-6">
      {chatUnavailable && (
        <p
          role="alert"
          className="rounded-md border border-border bg-muted px-4 py-3 text-sm"
        >
          This conversation is unavailable.
          The member may no longer be active.
        </p>
      )}
      <div>
        <p className="text-sm font-medium text-primary">
          IMS Network
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Alumni directory
        </h1>

        <p className="mt-3 text-muted-foreground">
          Connect with active ESITH IMS alumni by name,
          program, professional details, or graduation year.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find members</CardTitle>
          <CardDescription>
            Search matches the beginning of a name, program, company, role, location or skills field.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            action="/members"
            method="get"
            className="flex flex-wrap items-end gap-4"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <label
                htmlFor="member-search"
                className="text-sm font-medium"
              >
                Search
              </label>

              <Input
                id="member-search"
                name="q"
                placeholder="Name, company, role or skills"
                maxLength={80}
                defaultValue={result.q}
              />
            </div>

            <div className="space-y-2 sm:w-44">
              <label
                htmlFor="graduation-year"
                className="text-sm font-medium"
              >
                Graduation year
              </label>

              <Input
                id="graduation-year"
                name="year"
                type="number"
                min={1950}
                max={new Date().getUTCFullYear() + 10}
                defaultValue={result.year ?? ""}
                placeholder="Any year"
              />
            </div>

            <div className="space-y-2 min-w-0">
              <label htmlFor="mentorship" className="text-sm font-medium">Mentorship</label>
              <select id="mentorship" name="mentorship" defaultValue={result.mentorship} className="block min-h-10 max-w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Any availability</option><option value="open">Open to mentor</option><option value="seeking">Seeking a mentor</option><option value="unavailable">Unavailable</option>
              </select>
            </div>
            <Button type="submit">
              Search
            </Button>

            <Link prefetch={false}
              href="/members"
              className="pb-2 text-center text-sm underline-offset-4 hover:underline"
            >
              Clear
            </Link>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Active members
        </h2>

        <p className="text-sm text-muted-foreground">
          Showing {result.members.length} per page,
          up to 12
        </p>
      </div>

      <MemberDirectoryTable members={result.members} />

      {result.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={`/members?${nextParams.toString()}`}
            prefetch={false}
            className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted"
          >
            Next page
          </Link>
        </div>
      ) : null}
    </div>
  );
}
