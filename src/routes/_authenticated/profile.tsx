import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
  head: () => ({
    meta: [{ title: "Profil — Aivy & Me" }],
  }),
});

function Profile() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle().then(({ data }) => {
      setDisplayName(data?.display_name ?? "");
    });
  }, [user]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user!.id, display_name: displayName });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil gespeichert");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  }

  return (
    <div className="px-6 pt-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <User className="h-8 w-8 text-accent-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-3xl">Dein Profil</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="dn">Anzeigename</Label>
          <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Speichern…" : "Speichern"}
        </Button>
      </div>

      <div className="mt-6 rounded-3xl bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-lg">Konto</h2>
        <Button variant="outline" onClick={signOut} className="w-full">
          <LogOut className="mr-2 h-4 w-4" /> Abmelden
        </Button>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">Aivy &amp; Me · Version 0.1</p>
    </div>
  );
}