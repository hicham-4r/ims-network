import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">
          Administration
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Admin foundation
        </h1>

        <p className="mt-3 max-w-2xl text-muted-foreground">
          Authorization, account approvals, audit logs, and moderation tools
          are not implemented yet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Protected functionality will come later</CardTitle>
        </CardHeader>

        <CardContent className="text-sm leading-6 text-muted-foreground">
          This route currently exists only to establish the administration
          layout boundary. UI visibility will never replace server-side
          authorization.
        </CardContent>
      </Card>
    </div>
  );
}
