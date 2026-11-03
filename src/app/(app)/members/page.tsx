import Link from "next/link";

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

type SearchParams = {
  q?: string | string[];
  year?: string | string[];
  cursor?: string | string[];
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
  };

  const result = await listActiveMembers(input).catch(
    (error: unknown) => {
      if (error instanceof InvalidDirectoryQueryError) {
        return null;
      }

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
          <Link
            href="/members"
            className="text-sm font-medium underline"
          >
            Clear filters
          </Link>
        </CardContent>
      </Card>
    );
  }

  const nextParams = new URLSearchParams();

  if (result.q) {
    nextParams.set("q", result.q);
  }

  if (result.year !== null) {
    nextParams.set("year", String(result.year));
  }

  if (result.nextCursor) {
    nextParams.set("cursor", result.nextCursor);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-primary">
          IMS Network
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          ESITH IMS alumni directory
        </h1>

        <p className="mt-3 text-muted-foreground">
          Connect with active ESITH IMS alumni by name,
          program, or graduation year.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find members</CardTitle>
          <CardDescription>
            Search matches the beginning of a name
            or program.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            action="/members"
            method="get"
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
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
                placeholder="Name or program"
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

            <Button type="submit">
              Search
            </Button>

            <Link
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

      {result.members.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {result.members.map((member) => (
            <Card key={member.userId}>
              <CardHeader>
                <CardTitle>
                  <Link
                    href={`/members/${encodeURIComponent(member.userId)}`}
                    className="underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {member.displayName}
                  </Link>
                </CardTitle>

                <CardDescription>
                  {member.program ?? "ESITH IMS alumnus"}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                {member.graduationYear ? (
                  <p>
                    <span className="text-muted-foreground">
                      Graduation year:{" "}
                    </span>
                    {member.graduationYear}
                  </p>
                ) : null}

                {member.bio ? (
                  <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                    {member.bio}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active members match these filters.
          </CardContent>
        </Card>
      )}

      {result.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={`/members?${nextParams.toString()}`}
            className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted"
          >
            Next page
          </Link>
        </div>
      ) : null}
    </div>
  );
}
