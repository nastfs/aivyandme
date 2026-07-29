import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureDemoUser } from "@/lib/demo-user.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      try {
        const creds = await ensureDemoUser();
        const { error } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (error) throw error;
      } catch (e) {
        console.error("Demo auto-login failed", e);
        throw redirect({ to: "/auth" });
      }
    }
  },
  component: Layout,
});

function Layout() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-md">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}