import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Aivy & Me" },
      { name: "description", content: "Sign in to Aivy & Me and open your digital wardrobe." },
    ],
  }),
});

function AuthPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes("invalid login")
            ? t("auth.invalidCredentials")
            : error.message,
        );
      }
      goNext();
    } catch (err: any) {
      const msg = err.message ?? t("auth.genericError");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-5xl">Aivy &amp; Me</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl bg-card p-6 shadow-sm">
        <h2 className="text-2xl">{t("auth.welcome")}</h2>

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </Button>

        {error && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="w-full text-center text-sm text-muted-foreground">
          {t("auth.testAccountOnly")}
        </p>
      </form>
    </div>
  );
}