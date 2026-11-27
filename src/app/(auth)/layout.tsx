import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="ims-brand mb-8 w-fit"
        >
          <span className="ims-mark" aria-hidden="true"/><span>IMS Network<small>ESITH alumni</small></span>
        </Link>

        {children}
      </div>
    </main>
  );
}
