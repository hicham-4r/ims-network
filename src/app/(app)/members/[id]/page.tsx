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
import { requireActiveMemberPage } from "@/server/account-state/routing";

import { startMemberConversation } from "./actions";
import { StartChatSubmit } from "./start-chat-submit";

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

  const { session } = await requireActiveMemberPage();
  const canMessage = session.user.id !== member.userId;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link prefetch={false}
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
          <div className="flex flex-wrap items-center gap-5">
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
            {[member.jobTitle, member.company, member.location].filter(Boolean).join(" · ") || "ESITH · Morocco"}
          </CardDescription>

            </div>

            {canMessage && (
              <form
                action={startMemberConversation.bind(
                  null,
                  member.userId,
                )}
                className="sm:ml-auto"
              >
                <StartChatSubmit />
              </form>
            )}
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

          {(member.skills || member.mentorship) && <section className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">Expertise &amp; networking</h2>{member.skills && <div className="flex flex-wrap gap-2">{member.skills.split(/[,;]+/).map(s => s.trim()).filter(Boolean).slice(0,20).map((skill,i) => <span key={`${i}:${skill}`} className="ims-skill-tag">{skill}</span>)}</div>}{member.mentorship && <p className="text-sm text-muted-foreground">{member.mentorship === "open" ? "Open to mentor" : member.mentorship === "seeking" ? "Seeking a mentor" : "Not available for mentorship"}</p>}</section>}
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
