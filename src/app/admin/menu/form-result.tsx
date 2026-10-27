import type { FormState } from "./actions";

export function FormResult({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="w-full text-sm text-green-700">{state.ok}</p>;
  return null;
}
