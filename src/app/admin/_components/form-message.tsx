import type { FormResult } from "@/app/_components/use-kept-form";

export function FormMessage({ state }: { state: FormResult }) {
  if (state.error) return <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="w-full text-sm text-green-700">{state.ok}</p>;
  return null;
}
