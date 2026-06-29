"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: string;
  pendingText: string;
  className?: string;
};

export function SubmitButton({ children, pendingText, className = "" }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingText : children}
    </button>
  );
}
