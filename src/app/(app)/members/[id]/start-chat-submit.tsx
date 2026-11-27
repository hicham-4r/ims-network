"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function StartChatSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      aria-label="Open private conversation"
    >
      {pending ? "Opening..." : "Message"}
    </Button>
  );
}
