
# Digitaler Kleiderschrank – Erster Build

Mobile-first Web-App im Look der Mockups (warme Off-Whites, Beige/Taupe/Camel-Akzente, feine Serif-Anmutung für Headlines, viel Whitespace, abgerundete Cards, Bottom-Navigation).

## Umfang dieses Builds

1. **Auth & Profil** – Registrierung, Login, Logout, Profilseite. Passwort-Schutz via Lovable Cloud (E-Mail + Passwort, optional Google später).
2. **Kleiderschrank** – Teile per Foto hinzufügen, automatische Erkennung von Kategorie/Farbe via Lovable AI (Gemini Vision), Übersicht mit Kategorie-Chips (Alle, Oberteile, Hosen, Kleider, Blazer, Röcke, Schuhe, Taschen, Sport) und Zähler pro Kategorie.
3. **Outfits** – Manuelles Zusammenstellen aus eigenen Teilen, Speichern mit Namen, Planen auf einem Datum (Kalenderansicht + Wochen-Streifen wie im Mockup).
4. **Home** – Begrüßung, Outfit für heute (falls geplant), Kleiderschrank-Kategorien-Preview, zuletzt getragen.
5. **Navigation** – Bottom-Nav: Home, Kleiderschrank, Outfits, Profil (Entdecken kommt später).

## Explizit NICHT in diesem Build
Wetter, Style-Swipe-Onboarding, Lernen aus Bewertungen, KI-Bildglättung, Nachhaltigkeits-Dashboard, Entdecken-Tab.

## Screens
- `/auth` – Login/Registrierung
- `/` – Home (auth-gated)
- `/wardrobe` – Kleiderschrank-Übersicht mit Kategorie-Chips + Grid
- `/wardrobe/add` – Teil hinzufügen (Foto → KI-Erkennung → bestätigen/anpassen → speichern)
- `/wardrobe/:id` – Teil-Detail (Foto, Kategorie, Farbe, löschen)
- `/outfits` – Wochenplaner + gespeicherte Looks
- `/outfits/new` – Outfit erstellen (Teile auswählen, benennen, optional Datum planen)
- `/profile` – Profil + Logout

## Technische Details

**Backend:** Lovable Cloud (Auth, Postgres, Storage-Bucket `wardrobe`).

**Tabellen**
- `profiles` (id → auth.users, display_name, created_at)
- `wardrobe_items` (id, user_id, image_url, category enum, name, color, notes, created_at)
- `outfits` (id, user_id, name, notes, created_at)
- `outfit_items` (outfit_id, item_id)
- `outfit_plans` (id, user_id, outfit_id, planned_date)

RLS: jede Zeile nur für `auth.uid() = user_id`. Grants für `authenticated` + `service_role`. Trigger legt Profile beim Signup automatisch an.

**Storage:** Bucket `wardrobe` (public read, insert nur eingeloggt, User-Ordner via `auth.uid()`).

**KI-Erkennung:** Server-Function ruft Lovable AI Gateway (`google/gemini-2.5-flash`) mit dem hochgeladenen Bild und einem strukturierten Prompt auf, gibt `{category, name, color}` zurück. Nutzer kann Ergebnis vor dem Speichern überschreiben.

**Design-Tokens** in `src/styles.css`: warmes Cream als Background (`oklch(0.98 0.008 80)`), Taupe/Camel als Primary (`oklch(0.55 0.06 60)`), sanfte Cards mit `--radius 1.25rem`. Headings Serif (Instrument Serif), Body Sans (Work Sans) via `<link>` in `__root.tsx`.

**Routing:** TanStack Router File-Routes unter `_authenticated/`, `/auth` public, Bottom-Nav-Layout in `_authenticated/route.tsx`.

## Aufbau-Reihenfolge
1. Lovable Cloud aktivieren, Migration (Tabellen, RLS, Grants, Trigger, Storage-Policies).
2. Design-System + Bottom-Nav-Layout.
3. Auth-Screen + Profilseite.
4. Kleiderschrank: Add-Flow mit KI-Erkennung → Übersicht mit Kategorie-Filter.
5. Outfits: Erstellen + Wochen-/Kalender-Planer.
6. Home-Screen mit Live-Daten.
7. Smoke-Test des Auth- und Add-Flows im Preview.

Nach Freigabe lege ich direkt los.
