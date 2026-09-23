import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, User } from "lucide-react";
import { useLanguage, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
  head: () => ({
    meta: [{ title: "Profile — Aivy & Me" }],
  }),
});

function Profile() {
  const { t, lang, setLang } = useLanguage();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

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
    toast.success(t("profile.saved"));
  }

  async function updatePassword() {
    if (newPassword.length < 8) return toast.error(t("profile.passwordTooShort"));
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success(t("profile.passwordUpdated"));
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  }

  return (
    <div className="px-6 pt-10 pb-8">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <User className="h-8 w-8 text-accent-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-3xl">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </header>

      <div className="space-y-4 rounded-3xl bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="dn">{t("profile.displayName")}</Label>
          <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? t("profile.saving") : t("profile.save")}
        </Button>
      </div>

      <div className="mt-6 space-y-4 rounded-3xl bg-card p-5 shadow-sm">
        <h2 className="text-lg">{t("profile.account")}</h2>
        <div className="space-y-2">
          <Label>{t("profile.email")}</Label>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">{t("profile.changePassword")}</Label>
          <Input
            id="pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("profile.newPassword")}
            minLength={8}
          />
        </div>
        <Button
          variant="outline"
          onClick={updatePassword}
          disabled={updatingPassword || !newPassword}
          className="w-full"
        >
          {updatingPassword ? t("profile.saving") : t("profile.updatePassword")}
        </Button>
        <Button variant="outline" onClick={signOut} className="w-full">
          <LogOut className="mr-2 h-4 w-4" /> {t("profile.signOut")}
        </Button>
      </div>

      <div className="mt-6 space-y-3 rounded-3xl bg-card p-5 shadow-sm">
        <h2 className="text-lg">{t("profile.language")}</h2>
        <p className="text-xs text-muted-foreground">{t("profile.languageHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          {(["en", "de"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                lang === l ? "border-primary bg-accent" : "border-border bg-background"
              }`}
            >
              {l === "en" ? "English" : "Deutsch"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">{t("profile.version")}</p>
    </div>
  );
}
