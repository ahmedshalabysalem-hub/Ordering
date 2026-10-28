import { ar } from "@/i18n/ar";
import { en } from "@/i18n/en";

// Unknown or retired QR code or tracking link. Shown in both languages: there is no table to take a
// language from.
export default function CustomerNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 p-6 text-center text-zinc-900">
      <section lang="ar" dir="rtl" className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">{ar["notFound.title"]}</h1>
        <p>{ar["notFound.body"]}</p>
      </section>
      <section lang="en" dir="ltr" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">{en["notFound.title"]}</h2>
        <p>{en["notFound.body"]}</p>
      </section>
    </main>
  );
}
