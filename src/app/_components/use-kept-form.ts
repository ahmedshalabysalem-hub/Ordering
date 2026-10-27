"use client";

import { type FormEvent, useActionState, useEffect, useRef, useTransition } from "react";

export type FormResult = { error?: string; ok?: string };

/**
 * useActionState for staff forms that keeps what the user typed when the server rejects it.
 * React resets a <form action> after every submission, which would wipe the fields on a validation
 * error; submitting through onSubmit avoids that. Pass resetOnSuccess for "add another" forms.
 */
export function useKeptForm(
  action: (prev: FormResult, formData: FormData) => Promise<FormResult>,
  { resetOnSuccess = false } = {},
) {
  const [state, formAction, actionPending] = useActionState<FormResult, FormData>(action, {});
  const [transitionPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    // A saved upload must not be sent again with the next save.
    formRef.current?.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => (input.value = ""));
  }, [state, resetOnSuccess]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };

  return { state, pending: actionPending || transitionPending, formRef, onSubmit };
}
