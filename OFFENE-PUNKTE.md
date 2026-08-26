# Offene Punkte

*Notiert am 26.08.2026 fuer spaetere Sitzungen. Erledigte Punkte bitte streichen,
nicht abhaken — die Datei soll kurz bleiben.*


## Toolchain-Stand

Dieses Repo laeuft seit dem 26.08.2026 auf **pnpm** (nicht npm) — betroffen ist `frontend/`.
Alle Repos teilen sich einen pnpm-Store, der genau so weit dedupliziert, wie die
Versionen uebereinstimmen. **Einzelne Pakete also nicht im Alleingang
hochziehen** — das faellt allen anderen Repos zur Last.

## Versions-Update steht aus — siehe VERSION-UPGRADE.md

Dieses Repo ist als eines der letzten **nicht** auf der projektweiten Hausbasis
(TypeScript ~7.0.2, Vite ^8.2.2, React 19.2.8). Das Briefing daneben beschreibt
den konkreten Abstand, die Reihenfolge und die Fallstricke aus den bereits
erledigten Wellen. Es ist das fuehrende Dokument dafuer — diese Datei hier
wiederholt es nicht.

Solange der Abstand besteht, zieht dieses Repo eigene Kopien von TypeScript,
Vite und React in den gemeinsamen pnpm-Store. Gemessen: ~158 MB statt ~8 MB.

## `react-resizable` muss deklariert bleiben

Steht seit dem 26.08.2026 als direkte Dependency, obwohl es nur ueber
`react-grid-layout` hereinkam. `src/index.css` importiert
`react-resizable/css/styles.css` direkt; unter npm war das ueber das flache
`node_modules` zufaellig sichtbar, unter pnpm nicht. Ohne den Eintrag bricht der
Build mit *"Unable to resolve @import react-resizable/css/styles.css"*.

**Als vermeintlich unbenutzte Dependency also nicht entfernen.**

## Nur `frontend/` ist betroffen

Das FastAPI-Backend unter `backend/` hat eine eigene `.venv` und wurde von der
pnpm-Umstellung nicht beruehrt.

## Nichts davon ist gepusht

Alle Aenderungen vom 26.08.2026 liegen als lokale Commits.

## Beim naechsten Paket-Update

Weder `pnpm install` noch `pnpm prune` raeumt die alte Version aus
`node_modules/.pnpm`. Nach einem Upgrade deshalb
`rm -rf node_modules && pnpm install`, dann `pnpm store prune` — sonst bleibt
der Speichergewinn auf dem Papier.
