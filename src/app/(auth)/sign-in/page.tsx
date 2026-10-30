import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Authentication is not implemented yet.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">
                Email address
              </FieldLabel>

              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                disabled
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">
                Password
              </FieldLabel>

              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                disabled
              />

              <FieldDescription>
                Sign-in will become available when the authentication phase is
                implemented.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <Button
            type="submit"
            className="w-full"
            disabled
          >
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
