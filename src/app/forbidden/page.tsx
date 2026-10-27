import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not allowed" };

export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-zinc-600">Ask an administrator if you need it.</p>
      <Link href="/staff" className="underline">
        Back
      </Link>
    </main>
  );
}
