"use client";

import { useFormStatus } from "react-dom";
import { LoadingSpinner, playrButtonClasses } from "@/components/playr-ui";

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
      aria-busy={pending}
      className={className || playrButtonClasses()}
      disabled={pending}
      type="submit"
    >
      {pending ? <><LoadingSpinner />{pendingText}</> : children}
    </button>
  );
}
