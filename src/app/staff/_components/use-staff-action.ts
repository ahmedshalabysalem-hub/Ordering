"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "../actions";

/** Runs a staff server action, keeps its message and re-reads the screen afterwards. */
export function useStaffAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await action();
      setResult(r);
      router.refresh();
    });
  return { pending, result, run, clear: () => setResult({}) };
}
