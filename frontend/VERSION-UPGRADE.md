# Versions-Update — home_dashboard/frontend

*Briefing fuer eine eigene Claude-Code-Sitzung in diesem Repo. Angelegt 26.08.2026,
nach Welle 1 und 2 fortgeschrieben. Nach erledigtem Update loeschen.*

## Auftrag

Dieses Repo auf die Hausbasis ziehen, die ueber alle bagruber-Repos gilt. Der Zweck
ist nicht Aktualitaet um ihrer selbst willen: alle Repos teilen sich einen
gemeinsamen pnpm-Store, der exakt so weit dedupliziert, wie die Versionen
uebereinstimmen. Gemessen: ein Repo mit abweichenden Versionen kostet ~158 MB, ein
Versions-Zwilling ~8 MB.

**Dieses Repo ist eines der letzten vier.** Der aufwendigste der vier, deshalb zuletzt in Welle 3.

## Was bereits steht (26.08.2026)

**Welle 1 und 2 sind durch.** Zwoelf Repos stehen auf TypeScript ~7.0.2,
@types/node ^26.3.0, Vite ^8.2.2 und @vitejs/plugin-react ^6.1.0 — alle Builds und
Tests verifiziert gruen. Jede dieser Versionen liegt jetzt genau einmal im
gemeinsamen Store statt in bis zu sechs Auspraegungen.

Erfahrungen daraus, die fuer dieses Repo relevant sind:

- **TypeScript 7 hat `baseUrl` entfernt** (Fehler TS5102). Wo `"baseUrl": "."`
  neben `"paths"` stand, genuegte es, die Zeile ersatzlos zu streichen — TS 7 loest
  `paths` relativ zur tsconfig-Datei auf, die Pfade stimmen unveraendert weiter.
- **TypeScript 7 zieht `@types/*` nicht mehr automatisch in jeden Scope** (TS2591).
  Wo Code unter `src` `node:fs` oder `__dirname` nutzt, braucht die zustaendige
  tsconfig ein explizites `"types": ["node"]`.
- **Vite 8 ersetzt rollup durch rolldown.** Das lief in zwoelf Repos ohne eine
  einzige Anpassung durch, die dist-Groessen blieben praktisch unveraendert. Wichtig
  ist nur, dass `@vitejs/plugin-react` mit auf 6.x geht — 4.x ist mit Vite 8 nicht
  kompatibel. Die neuen Peers von plugin-react 6 (`oxc-transform-react`,
  `@rolldown/plugin-babel`, `babel-plugin-react-compiler`) sind optional und werden
  nicht gebraucht.
- **Vite 8 und plugin-react 6 verlangen Node ^20.19 oder >=22.12.** Die CI-Workflows
  stehen auf `node-version: 22`, was aktuelle 22.x aufloest und damit passt.

## Hausbasis

| Paket | Zielversion | Stand |
|---|---|---|
| typescript | ~7.0.2 | erledigt in 13 Repos |
| @types/node | ^26.3.0 | erledigt in 13 Repos |
| vite | ^8.2.2 | erledigt in 12 Repos |
| @vitejs/plugin-react | ^6.1.0 | erledigt in 12 Repos |
| react / react-dom | 19.2.x | hier offen |
| tailwindcss | 4.x | nur home_dashboard offen |
| react-router-dom | 7.x | nur etymology offen |

## Noch zu tun in diesem Repo

| Paket | Ist | Ziel |
|---|---|---|
| `react / react-dom` | ^18.3.1 | ^19.2.x |
| `tailwindcss` | ^3.4.13 | ^4.x |
| `vite` | ^5.4.8 | ^8.2.2 |
| `@vitejs/plugin-react` | ^4.3.2 | ^6.1.0 |
| `typescript` | ^5.6.2 | ~7.0.2 |

## Besonderheit

**Tailwind 3 -> 4 ist keine Versionserhoehung, sondern ein Konfigurations-Wechsel:** `tailwind.config.js` entfaellt zugunsten CSS-first-Konfiguration, `postcss` und `autoprefixer` werden nicht mehr gebraucht. Zuerst Tailwind allein migrieren und verifizieren, dann der Rest.

Betrifft ausschliesslich `frontend/`; das FastAPI-Backend bleibt unberuehrt. `react-resizable` wurde am 26.08.2026 als direkte Dependency ergaenzt (war nur transitiv ueber `react-grid-layout` da) — nicht wieder entfernen.

## Vorgehen

1. Ausgangslage sichern: der Build muss **vor** dem Update gruen sein.
2. Pakete einzeln oder in kleinen Gruppen hochziehen, nach jeder Gruppe bauen.
   Bricht etwas, ist die Ursache dann eindeutig.
3. Bei Majors die jeweilige Migrations-Doku lesen, bevor die Version angefasst wird.
4. Zum Schluss `rm -rf node_modules && pnpm install` und `pnpm store prune`.

## Verifikation

```bash
pnpm run build
```

Muss gruen sein.

## Fallstricke

1. **Ein Lockfile-Wechsel ist ein Update.** `pnpm install` loest Ranges neu auf. In
   moosburg brach ein reiner Patch-Sprung `react-map-gl 8.1.1 -> 8.1.2` den
   `maxBounds`-Typ. Bricht nach einem Update etwas: erst pruefen, welche Version
   vorher im Lockfile stand, bevor die eigene Codebasis verdaechtigt wird.
2. **Phantom-Dependencies.** pnpm zeigt Pakete nur, wenn sie deklariert sind. Taucht
   ein "cannot resolve X" auf, obwohl X frueher ging: X war transitiv vorhanden und
   gehoert jetzt korrekt in die package.json (`pnpm add`), nicht ins Hoisting
   zurueckgebogen.
3. **Build-Scripts sind per Default blockiert.** Bei `ERR_PNPM_IGNORED_BUILDS`
   `pnpm approve-builds <paket>` ausfuehren.
4. **Alte Versionen bleiben nach einem Upgrade liegen.** Weder `pnpm install` noch
   `pnpm prune` raeumt den alten Eintrag aus `node_modules/.pnpm`. Erst
   `rm -rf node_modules && pnpm install`, dann `pnpm store prune`. In Welle 1 hat
   das 797 MB freigegeben, in Welle 2 nochmal 382 MB — ohne diesen Schritt bleibt
   der Dedup-Gewinn auf dem Papier.
