import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">
          Member application
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-muted-foreground">
          This route currently verifies the member application boundary.
          Authentication and member data are not implemented yet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation only</CardTitle>
        </CardHeader>

        <CardContent className="text-sm leading-6 text-muted-foreground">
          Real member information, messages, notifications, and statistics will
          only appear after their backend features are implemented.
        </CardContent>
      </Card>
    </div>
  );
}
