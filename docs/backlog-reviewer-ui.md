# Backlog: Reviewer UI (Liam) — Stand 8. Nov 2026

Mit dem aktuellen Code auf `main` abgeglichen. Live-Datenbank und Deployment sind damit nicht verifiziert. Gemeinsame Aufgaben stehen in [To-do Liam](todo-liam.md).

## Implementiert

- [x] Inbox mit Empfehlungs-/Statusfilter und Suche; Sortierung nach Eingangsdatum (`received_at`), bei fehlenden Daten mit Case-ID als Fallback. Case-IDs sind keine allgemeine Zeitquelle.
- [x] Warteschlangen-Position für offene, noch ausstehende Human-Review-Fälle.
- [x] Eingangsdatum in der Liste und Wartezeit in Tagen auf der Fallseite; simulierte Demo-Daten sind gekennzeichnet.
- [x] Fallnavigation mit Zurück/Vor/Weiter und Browser-Zurück; geteilte Ansicht mit verstellbarer Liste.
- [x] Reviewer-Aktionen für Human-Review-Fälle: Freigabe, Informationsanforderung und Reject. Keine deaktivierten Funktionsplatzhalter mehr.
- [x] Override für Routine-/Info-Fälle, inklusive Grund und Audit-Historie; Freigabe/Informationsanforderung bei Human-Review-Fällen werden ebenfalls als Reviewer-Korrektur erfasst.
- [x] Reject-Migration und UI implementiert; Anwendung der Migration und Speicherung im Live-System noch prüfen.
- [x] Offene Fälle verwenden die aktive Policy; geänderte Ergebnisse werden als Recheck markiert. Geschlossene Fälle behalten ihre gespeicherte Entscheidung.
- [x] Fallseite mit Klartext-Fakten, regelbasierter Prüfanweisung und farblich getrennten Empfehlungen.

## Offen

- [ ] Review-only als Standardansicht: aktuell sind Empfehlung und Status beim Öffnen auf „alle“ gesetzt.
- [ ] Eigener Filter nach Reason-Kategorie. Kategorien aus den aktiven Regeln ableiten; mehrere Auslöser pro Claim berücksichtigen. Offizielles v1-Limit: 1.500 €, v2: 1.200 € plus EV-Hochvoltbatterie-Regel.
- [ ] Gewünschtes Verhalten beim Zusammenführen mehrerer CSVs klären. CSV-Beispiele sind browserlokal und schreibgeschützt; die persistierte Review-Queue ist ein separater Ablauf.
- [ ] Systematische Stichprobenauswahl für Routine-Fälle; manuelles Öffnen und Override sind bereits möglich.
- [ ] Abschließendes UI-Feedback und verbleibende Arbeitsteilung im Team abstimmen.

## Vor der Jury live prüfen

- [ ] Human-Review-Fall bearbeiten und Routine-/Info-Fall überschreiben; Korrektur, Grund, Reviewer und Policy-Version in der Audit-Historie kontrollieren.
- [ ] Reject nach Anwendung aller Migrationen testen.
- [ ] Policy wechseln: offene Fälle neu bewerten, Recheck anzeigen, geschlossene Entscheidungen unverändert lassen.
