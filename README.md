# App MVP

Baue eine mobile-first Web-App: ein digitaler Kleiderschrank, der Nutzern hilft, bestehende Kleidung vielfältiger zu tragen, nachhaltiger zu konsumieren und gezielter neu einzukaufen. Anbei die Mockups des gewünschten Designs (Home, Kleiderschrank-Übersicht, Kleiderschrank nah, Teil hinzufügen, Outfits, Nachhaltigkeit).

Gesamtvision (zur Einordnung, nicht alles auf einmal bauen):
- Automatisierte Erkennung beim Einscannen von Kleidungsstücken (wichtigste Funktion): Nutzer sollen Teile einfach einlegen/fotografieren können, ohne jedes Detail manuell einzutragen; die App soll erkennen, um was für ein Teil es sich handelt, damit der Einstieg super leicht ist.
- KI soll gescannte Teile "glätten": ordentlich wie an einem Kleiderbügel bzw. wie auf einem Moodboard, aber ohne charakteristische Details wie Flecken zu entfernen oder das Teil zu perfektionieren.
- Style-Onboarding nach Anmeldung: Nutzer laden Bilder eigener/gewünschter Outfits hoch oder swipen Tinder-artig durch Vorschläge (rechts wischen = gefällt, links = gefällt nicht).
- Die App soll daraus lernen und personalisierte Outfit-Vorschläge aus den eigenen Teilen erstellen. Nutzer sollen Vorschläge bewerten können, schlecht bewertete Outfits werden dann nicht mehr vorgeschlagen, die App lernt daraus über die Präferenzen des Nutzers.
- Wetter-Integration: Outfit-Vorschläge sollen zum Wetter passen (kein warmes Outfit bei 30°C).
- Kalenderfunktion zum Planen von Outfits.
- Registrierung/Login und Profilseite, Konto mit Passwort abgesichert.

Für den ersten Build bitte nur den Kern umsetzen:
1. Registrierung/Login + Profilseite mit sicherem Passwortschutz.
2. Kleiderschrank: Teile per Foto hinzufügen inkl. automatischer Erkennung/Kategorisierung der Teile (die wichtigste Funktion), Übersicht nach Kategorie wie in den Mockups (Alle, Oberteile, Hosen, Kleider, Blazer, Röcke, Schuhe, Taschen, Sport).
3. Outfits manuell aus den eigenen Teilen zusammenstellen und in einer Kalenderansicht planen (wie im "Outfits"-Mockup).
4. UI/Screens nah an den angehängten Mockups umsetzen (Home, Kleiderschrank-Übersicht, Teil hinzufügen, Outfits).

Wetter-Integration, Style-Swipe-Onboarding, Lernen aus Bewertungen und die KI-Bildglättung kommen in späteren Schritten, bitte in diesem ersten Build noch nicht einbauen.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aivyandme.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8b16883d-d728-4085-aca2-2dd9f5908923).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
