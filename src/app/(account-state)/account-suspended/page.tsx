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

export default async function AccountSuspendedPage() {
  await requireAccountStatusPage("SUSPENDED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Account suspended
        </CardTitle>

        <CardDescription>
          Member access has been temporarily disabled.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Your account is currently suspended and
          cannot access the IMS Network member area.
          Contact an administrator for assistance.
        </p>

        <SignOutButton />
      </CardContent>
    </Card>
  );
}
