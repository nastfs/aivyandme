import { Link } from "@tanstack/react-router";
import { Home, Shirt, LayoutGrid, User } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const items = [
  { to: "/", key: "nav.home", icon: Home, exact: true },
  { to: "/wardrobe", key: "nav.wardrobe", icon: LayoutGrid, exact: false },
  { to: "/outfits", key: "nav.outfits", icon: Shirt, exact: false },
  { to: "/profile", key: "nav.profile", icon: User, exact: false },
] as const;

export function BottomNav() {
  const { t } = useLanguage();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border bg-card/95 backdrop-blur">
      <ul className="flex items-center justify-around px-2 py-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, key, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: !!exact }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-1 py-1 text-xs transition-colors"
            >
              <Icon className="h-5 w-5" strokeWidth={1.5} />
              <span>{t(key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}