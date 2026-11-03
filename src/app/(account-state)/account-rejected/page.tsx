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

export default async function AccountRejectedPage() {
  await requireAccountStatusPage("REJECTED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Account not approved
        </CardTitle>

        <CardDescription>
          This account does not currently have access
          to IMS Network.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Your account cannot access the member
          application. Contact an administrator if
          you believe this status is incorrect.
        </p>

        <SignOutButton />
      </CardContent>
    </Card>
  );
}
