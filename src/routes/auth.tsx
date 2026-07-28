import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Anmelden — Aivy & Me" },
      { name: "description", content: "Melde dich in Aivy & Me an und öffne deinen digitalen Kleiderschrank." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Konto erstellt");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
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
        <h2 className="text-2xl">{mode === "signin" ? "Willkommen zurück" : "Konto anlegen"}</h2>

        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emma" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Bitte warten…" : mode === "signin" ? "Anmelden" : "Registrieren"}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Noch kein Konto? Registrieren" : "Schon Mitglied? Anmelden"}
        </button>
      </form>
    </div>
  );
}