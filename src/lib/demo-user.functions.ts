import { createServerFn } from "@tanstack/react-start";

export const ensureDemoUser = createServerFn({ method: "POST" }).handler(async () => {
  const email = "emma@aivy.demo";
  const password = "emma-demo-1234!";
  const displayName = "Emma";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Check if user already exists
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);

  if (!existing) {
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createErr) throw createErr;
  }

  return { email, password };
});