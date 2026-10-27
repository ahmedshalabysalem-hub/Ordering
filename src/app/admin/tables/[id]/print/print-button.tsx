"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-zinc-300 px-4 py-2 font-medium print:hidden">
      Print
    </button>
  );
}
