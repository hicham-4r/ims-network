import Link from "next/link";

import { ProfileForm } from "./profile-form";
import { AvatarUploadForm } from "./avatar-upload-form";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  requireActiveMember,
} from "@/server/account-state";

function OptionalValue({
  value,
}: {
  value: string | number | null;
}) {
  return (
    <span>
      {value === null ||
      value === ""
        ? "Not provided"
        : value}
    </span>
  );
}

export default async function ProfilePage() {
  const {
    profile,
  } = await requireActiveMember();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">
            Member profile
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Edit profile
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            Manage the profile information that can
            be shown to other active ESITH IMS
            alumni.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              Profile information
            </CardTitle>

            <CardDescription>
              Your account email and authentication
              details are not public profile fields.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <AvatarUploadForm
              userId={profile.userId}
              displayName={profile.displayName}
              hasAvatar={Boolean(profile.avatarUrl)}
              version={profile.updatedAt.toISOString()}
            />

            <ProfileForm
              profile={{
                displayName:
                  profile.displayName,

                program:
                  profile.program,

                graduationYear:
                  profile.graduationYear,

                bio:
                  profile.bio,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Public member preview
            </CardTitle>

            <CardDescription>
              This is the profile information intended
              for the member directory.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div>
              <p className="text-2xl font-semibold tracking-tight">
                {profile.displayName}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                ESITH · Morocco
              </p>

              {profile.program ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile.program}
                </p>
              ) : null}
            </div>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  Graduation year
                </dt>
                <dd className="mt-1 font-medium">
                  <OptionalValue
                    value={
                      profile.graduationYear
                    }
                  />
                </dd>
              </div>

              <div>
                <dt className="text-muted-foreground">
                  Bio
                </dt>
                <dd className="mt-1 whitespace-pre-wrap leading-6">
                  <OptionalValue
                    value={profile.bio}
                  />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
