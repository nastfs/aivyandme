import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Anmelden — Aivy & Me" },
      { name: "description", content: "Melde dich in Aivy & Me an und öffne deinen digitalen Kleiderschrank." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function goNext() {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/" });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (next) window.location.href = next;
        else navigate({ to: "/" });
      }
    });
  }, [navigate, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes("invalid login")
            ? "E-Mail oder Passwort ist nicht korrekt."
            : error.message,
        );
      }
      goNext();
    } catch (err: any) {
      toast.error(err.message ?? "Etwas ist schiefgelaufen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-5xl">Aivy &amp; Me</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Dein digitaler Kleiderschrank. Bewusst kombinieren, planen, tragen.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl bg-card p-6 shadow-sm">
        <h2 className="text-2xl">Willkommen zurück</h2>

        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Bitte warten…" : "Anmelden"}
        </Button>

        <p className="w-full text-center text-sm text-muted-foreground">
          Zugang nur mit Test-Account (MVP-Phase)
        </p>
      </form>
    </div>
  );
}