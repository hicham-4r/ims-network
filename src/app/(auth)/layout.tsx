import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-8 w-fit text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          IMS Network
        </Link>

        {children}
      </div>
    </main>
  );
}
