import Link from "next/link";
import {
  ArrowRight,
  Database,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const principles = [
  {
    title: "ESITH IMS alumni",
    description:
      "A dedicated space for graduates of ESITH’s IMS program to reconnect across cohorts and share professional experiences.",
    icon: UsersRound,
  },
  {
    title: "Secure by design",
    description:
      "Authentication, authorization, account state, validation, and auditing are treated as server-side responsibilities.",
    icon: ShieldCheck,
  },
  {
    title: "Durable data",
    description:
      "PostgreSQL remains the source of truth for accounts, profiles, conversations, messages, and other durable data.",
    icon: Database,
  },
  {
    title: "Real-time when needed",
    description:
      "Messaging uses route-scoped real-time connections rather than keeping unnecessary sockets open across the application.",
    icon: MessageCircle,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section
          id="overview"
          className="border-b"
        >
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.25fr_0.75fr] lg:px-8 lg:py-32">
            <div className="flex flex-col justify-center">
              <Badge
                variant="secondary"
                className="mb-6 w-fit"
              >
                ESITH · IMS alumni
              </Badge>

              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Reconnect with the ESITH IMS alumni community.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                A dedicated network for graduates of the IMS program at
                ESITH in Morocco. Discover fellow alumni, share your journey,
                and build lasting connections across graduating classes.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/sign-up"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Join the network
                  <ArrowRight
                    className="size-4"
                    aria-hidden="true"
                  />
                </a>

                <a
                  href="/sign-in"
                  className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Sign in
                </a>
              </div>
            </div>

            <Card className="self-center">
              <CardHeader>
                <CardDescription>Current milestone</CardDescription>
                <CardTitle>Alumni profiles and directory</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <p>
                  Secure authentication, administrator approval, profile
                  editing, and a searchable member directory are available
                  in development. Private member messaging is available.
                </p>

                <div className="rounded-lg border bg-muted/40 p-4">
                  No production users, messages, statistics, or backend data
                  are being simulated on this interface.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          id="status"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
        >
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">
              Project status
            </p>

            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Building the ESITH IMS alumni community.
            </h2>

            <p className="mt-4 leading-7 text-muted-foreground">
              Development now includes Neon PostgreSQL, authentication,
              account approval, profiles, and the member directory.
              Private messaging and avatars are implemented; the platform remains in development.
            </p>
          </div>
        </section>

        <section
          id="architecture"
          className="border-y bg-muted/30"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-medium text-primary">
                Architecture direction
              </p>

              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Modern without unnecessary complexity.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {principles.map((principle) => {
                const Icon = principle.icon;

                return (
                  <Card key={principle.title}>
                    <CardHeader>
                      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon
                          className="size-5"
                          aria-hidden="true"
                        />
                      </div>

                      <CardTitle>{principle.title}</CardTitle>
                      <CardDescription>
                        {principle.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="roadmap"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
        >
          <Card>
            <CardHeader>
              <CardDescription>Next development work</CardDescription>
              <CardTitle>
                A more connected alumni community
              </CardTitle>
            </CardHeader>

            <CardContent>
              <p className="max-w-3xl leading-7 text-muted-foreground">
                The next milestones improve member discovery, messaging and the mobile experience, while keeping the application accessible and cost-conscious.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>IMS Network · ESITH, Morocco</p>
          <Link href="/privacy" className="underline underline-offset-4">Messaging and account privacy</Link>
          <p>Built with a security-first, cost-aware architecture.</p>
        </div>
      </footer>
    </div>
  );
}
