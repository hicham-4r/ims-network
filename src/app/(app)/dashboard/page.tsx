import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requireActiveMember,
} from "@/server/account-state";

export default async function DashboardPage() {
  const {
    session,
    accountState,
  } = await requireActiveMember();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">
            ESITH · IMS alumni
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Welcome, {session.user.name}. Connect with fellow IMS graduates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/profile"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Edit profile
          </Link>

          <Link href="/members" className="text-sm font-medium underline-offset-4 hover:underline">
            Members
          </Link>
          {accountState.role === "ADMIN" && accountState.status === "ACTIVE" ? (
            <Link
              href="/admin/accounts"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Admin Panel
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Authenticated session
          </CardTitle>
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
            Your account is active and authorized
            for the member application.
          </p>

          <p>
            Your profile and the alumni directory are available now.
            Messaging and additional features are planned for later phases.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
