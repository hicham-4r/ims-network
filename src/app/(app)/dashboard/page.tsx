import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentSession } from "@/server/auth";

export default async function DashboardPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">
            Member application
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Welcome, {session.user.name}.
          </p>
        </div>

        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authenticated session</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>
            You are signed in as{" "}
            <span className="font-medium text-foreground">
              {session.user.email}
            </span>
            .
          </p>

          <p>
            Member profiles, messaging, notifications, and statistics
            will be added in later phases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
