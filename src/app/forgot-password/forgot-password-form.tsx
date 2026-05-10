"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/reset-password/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
    } catch {
      // best-effort — same UX whether request succeeded or not
    }
    setDone(true);
    setSubmitting(false);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm">
            If an account exists for <strong>{email}</strong>, a reset link has
            been sent. Check your inbox and follow the instructions to choose a
            new password. The link expires in 2 hours.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Email" htmlFor="fp-email">
            <Input
              id="fp-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
