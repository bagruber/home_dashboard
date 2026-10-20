# Versions-Update — home_dashboard/frontend

*Briefing fuer eine eigene Claude-Code-Sitzung in diesem Repo. Angelegt 26.08.2026,
fortgeschrieben am 20.10.2026. Nach erledigtem Update loeschen.*

## Auftrag

Dieses Repo auf die Hausbasis ziehen, die ueber alle bagruber-Repos gilt. Der Zweck
ist nicht Aktualitaet um ihrer selbst willen: alle Repos teilen sich einen
gemeinsamen pnpm-Store, der exakt so weit dedupliziert, wie die Versionen
uebereinstimmen. Gemessen: ein Repo mit abweichenden Versionen kostet ~158 MB, ein
Versions-Zwilling ~8 MB.

**Dieses Repo ist eines der letzten zwei**, zusammen mit `etymology`. Die beiden
sind der Grund, warum von TypeScript, Vite, React und den React-Typen noch je ein
zweiter Stand im Store liegt; Tailwind 3 haelt nur dieses Repo offen. Der
aufwendigste Fall, weil Tailwind 4 eine Migration ist und keine Versionsnummer.

## Was seit August dazukam (20.10.2026)

- **Die Ziele sind gestiegen**: React 19.3, Vite 8.3 (Tabelle unten). Die
  uebrigen Repos stehen darauf, mit Build, Tests und Screenshot-Vergleich gruen.
- **React 19.3 bricht gegenueber 19.2 nichts.** Der eigentliche Sprung hier ist
  18 -> 19. Am 20.10.2026 geprueft: `createRoot` ist schon da, `ReactDOM.render`,
  `defaultProps`, `propTypes` und `findDOMNode` kommen im eigenen Code nicht vor.
  `forwardRef` (zweimal) funktioniert in 19 weiter.
- **`react-grid-layout` steht auf 1.5.4, aktuell ist 2.3.0.** Die Peers von 1.5
  erlauben React 19, aber das Paket zieht und skaliert ueber `react-draggable` und
  `react-resizable` direkt am DOM. Ob Ziehen und Groessenaendern unter React 19
  noch gehen, zeigt nur die Laufzeitprobe mit echter Maus. 2.x ist ein eigener
  Major und gehoert nicht in denselben Durchgang.
- **Tailwind 4 im Haus heisst**: `tailwindcss` ^4.3.3 und `@tailwindcss/vite`
  ^4.3.3, kein PostCSS-Plugin. So laufen alle zehn anderen Tailwind-Repos.

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

## Noch zu tun in diesem Repo

Die Zielversionen stehen in `../../hausbasis/baseline.json`, und
`node ../../hausbasis/check.mjs --kurz` zeigt, wo dieses Repo abweicht. Gilt bei
Abweichung die Baseline, nicht diese Tabelle. Stand 20.10.2026:

| Paket | Ist | Ziel |
|---|---|---|
| `react / react-dom` | ^18.3.1 | ^19.3.1 |
| `@types/react / @types/react-dom` | ^18.3.x | ^19.3.0 |
| `tailwindcss` | ^3.4.13 | ^4.3.3, dazu `@tailwindcss/vite` ^4.3.3 |
| `postcss`, `autoprefixer` | ^8.4 / ^10.4 | entfallen mit Tailwind 4 |
| `vite` | ^5.4.8 | ^8.3.4 |
| `@vitejs/plugin-react` | ^4.3.2 | ^6.1.2 |
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

## Laufzeitprobe nicht vergessen

**Ein gruener Build beweist bei einem React-Major wenig.** Der Bundler prueft nicht,
ob React zur Laufzeit durchlaeuft; entfernte APIs und geaendertes ref-Verhalten
zeigen sich erst im Browser. In pridemap (am 26.08.2026 als erstes Repo der Welle 3
umgestellt) war der Build sofort gruen — verlassen habe ich mich aber erst auf die
Probe im echten Browser.

Vorgehen, das dort funktioniert hat:

```bash
pnpm run build
pnpm exec vite preview --port 4173 &
# dann ein kurzes Skript IM REPO (nicht ausserhalb, sonst findet es
# playwright-core nicht) das die Seite laedt und auf Fehler achtet
```

Das Skript oeffnet die Seite mit `playwright-core`, sammelt `console`-Fehler und
`pageerror`-Ereignisse und prueft, dass `#root` tatsaechlich gefuellt ist. Zwei
Stolpersteine:

- **Browser-Version.** `playwright-core` erwartet einen exakten Chromium-Build. Der
  Cache unter `AppData/Local/ms-playwright` passte nicht (1223 statt 1234). Statt
  ~150 MB nachzuladen: `chromium.launch({ channel: 'chrome' })` nutzt das
  installierte Google Chrome.
- **Base-Pfad.** Die Repos deployen unter einem Unterpfad. `vite preview` antwortet
  auf `/` mit einem 302 auf z. B. `/pridemap/` — die Probe muss die Ziel-URL laden,
  nicht die Wurzel.

Als bestanden galt: `#root` gefuellt, null `pageerror`, und im sichtbaren Text
stehen echte Inhalte (bei pridemap "Showing 95 events" plus die
Karten-Attribution, womit auch belegt war, dass maplibre geladen hat).

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
