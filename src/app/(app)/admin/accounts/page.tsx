import {
  approveAccount,
  rejectAccount,
  restoreAccount,
  suspendAccount,
} from "./actions";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAdminAccountsPageData,
} from "@/server/account-state";

function formatDate(
  value: Date | null,
) {
  if (!value) {
    return "—";
  }

  return value.toLocaleString();
}

export default async function AdminAccountsPage() {
  const {
    session,
    accounts,
  } = await getAdminAccountsPageData();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">
          Administration
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Account management
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          Review pending accounts and manage member
          access. Every state-changing action is
          authorized on the server and recorded in
          the audit log.
        </p>
      </div>

      <div className="grid gap-4">
        {accounts.map((account) => {
          const isCurrentAdmin =
            account.userId === session.user.id;

          return (
            <Card key={account.userId}>
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      {account.name}
                    </CardTitle>

                    <CardDescription>
                      {account.email}
                    </CardDescription>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {account.status} · {account.role}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">
                      Email verified
                    </dt>
                    <dd className="font-medium">
                      {account.emailVerified
                        ? "Yes"
                        : "No"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-muted-foreground">
                      Registered
                    </dt>
                    <dd className="font-medium">
                      {formatDate(
                        account.createdAt,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-muted-foreground">
                      Approved
                    </dt>
                    <dd className="font-medium">
                      {formatDate(
                        account.approvedAt,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-muted-foreground">
                      Last state update
                    </dt>
                    <dd className="font-medium">
                      {formatDate(
                        account.updatedAt,
                      )}
                    </dd>
                  </div>
                </dl>

                {account.rejectionReason ? (
                  <p className="text-sm text-muted-foreground">
                    Rejection reason:{" "}
                    <span className="text-foreground">
                      {account.rejectionReason}
                    </span>
                  </p>
                ) : null}

                {account.suspensionReason ? (
                  <p className="text-sm text-muted-foreground">
                    Suspension reason:{" "}
                    <span className="text-foreground">
                      {account.suspensionReason}
                    </span>
                  </p>
                ) : null}

                {account.status ===
                "PENDING_APPROVAL" ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <form action={approveAccount}>
                      <input
                        type="hidden"
                        name="targetUserId"
                        value={account.userId}
                      />

                      <Button
                        type="submit"
                        className="w-full"
                      >
                        Approve account
                      </Button>
                    </form>

                    <form
                      action={rejectAccount}
                      className="space-y-3"
                    >
                      <input
                        type="hidden"
                        name="targetUserId"
                        value={account.userId}
                      />

                      <textarea
                        name="reason"
                        required
                        maxLength={500}
                        placeholder="Reason for rejection"
                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />

                      <Button
                        type="submit"
                        variant="destructive"
                        className="w-full"
                      >
                        Reject account
                      </Button>
                    </form>
                  </div>
                ) : null}

                {account.status === "ACTIVE" &&
                account.role === "MEMBER" ? (
                  <form
                    action={suspendAccount}
                    className="space-y-3"
                  >
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={account.userId}
                    />

                    <textarea
                      name="reason"
                      required
                      maxLength={500}
                      placeholder="Reason for suspension"
                      className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />

                    <Button
                      type="submit"
                      variant="destructive"
                    >
                      Suspend member
                    </Button>
                  </form>
                ) : null}

                {account.status ===
                "SUSPENDED" ? (
                  <form action={restoreAccount}>
                    <input
                      type="hidden"
                      name="targetUserId"
                      value={account.userId}
                    />

                    <Button type="submit">
                      Restore member
                    </Button>
                  </form>
                ) : null}

                {isCurrentAdmin ? (
                  <p className="text-xs text-muted-foreground">
                    This is your current administrator
                    account. Self-suspension is blocked
                    server-side.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}

        {accounts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No application accounts found.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
