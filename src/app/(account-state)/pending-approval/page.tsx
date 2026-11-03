import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requireAccountStatusPage,
} from "@/server/account-state";

export default async function PendingApprovalPage() {
  const {
    session,
  } = await requireAccountStatusPage(
    "PENDING_APPROVAL",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Account awaiting approval
        </CardTitle>

        <CardDescription>
          Your email has been verified successfully.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Your IMS Network account for{" "}
          <span className="font-medium text-foreground">
            {session.user.email}
          </span>{" "}
          is waiting for administrator approval.
          You will not have access to the member
          application until your account is approved.
        </p>

        <SignOutButton />
      </CardContent>
    </Card>
  );
}
