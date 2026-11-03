import Link from "next/link";
import type { ReactNode } from "react";

import {
  getApplicationPageAccount,
  redirectRestrictedAccount,
} from "@/server/account-state";

export default async function MemberLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const {
    accountState,
  } = await getApplicationPageAccount();

  redirectRestrictedAccount(
    accountState.status,
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <NetworkIcon className="size-5" aria-hidden="true" />
            </span>

            IMS Network
          </Link>

          <span className="text-sm text-muted-foreground">
            Member area
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function NetworkIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="12" cy="5" r="3" />
      <circle cx="5" cy="19" r="3" />
      <circle cx="19" cy="19" r="3" />
      <path d="M10.5 7.5 6.5 16" />
      <path d="m13.5 7.5 4 8.5" />
      <path d="M8 19h8" />
    </svg>
  );
}
