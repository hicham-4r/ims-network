import Link from "next/link";
import { MemberAvatar } from "@/components/members/member-avatar";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getActiveMemberById } from "@/server/members";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MemberDetailPage({
  params,
}: Props) {
  const { id } = await params;

  const member = await getActiveMemberById(id);

  if (!member) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href="/members"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to alumni directory
        </Link>

        <p className="mt-6 text-sm font-medium text-primary">
          ESITH · IMS alumni
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Alumni profile
        </h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-5">
            <MemberAvatar
              userId={member.userId}
              displayName={member.displayName}
              hasAvatar={Boolean(member.avatarUrl)}
              version={member.avatarUpdatedAt.toISOString()}
              size="lg"
            />
            <div className="min-w-0">

          <CardTitle className="text-2xl">
            {member.displayName}
          </CardTitle>

          <CardDescription>
            ESITH · Morocco
          </CardDescription>

            </div>
          </div>
</CardHeader>

        <CardContent className="space-y-8">
          <dl className="grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                Program
              </dt>
              <dd className="mt-2 font-medium">
                {member.program ?? "Not provided"}
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground">
                Graduation year
              </dt>
              <dd className="mt-2 font-medium">
                {member.graduationYear ?? "Not provided"}
              </dd>
            </div>
          </dl>

          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              About
            </h2>

            <p className="mt-3 whitespace-pre-wrap break-words leading-7">
              {member.bio || "No biography provided yet."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
