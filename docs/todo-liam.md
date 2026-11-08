# To-do Liam — Hackathon Taktile (Stand: 8. Nov 2026)

Mit dem aktuellen Code auf `main` abgeglichen. „Implementiert“ bestätigt den Repository-Stand, nicht den Zustand der gemeinsamen Supabase oder des Live-Deployments.
Detail-Backlog zur Reviewer-UI: [backlog-reviewer-ui.md](backlog-reviewer-ui.md).

## Offen

### Business Case
- [ ] Jahreskosten vorher/nachher einschließlich Implementierungs- und Betriebskosten, Payback, Fehlerkosten-Szenarien und Kosten eines Policy-Wechsels ergänzen. Die Savings-Karte berechnet derzeit nur Zeit- und Personalkostenersparnis im gewählten Zeitraum.

### Reviewer und Dashboard
- [ ] Review-only als Standardansicht festlegen/umsetzen; aktuell startet die Queue mit allen Empfehlungen und Status.
- [ ] Review: Chat-/Textbefehl für Entscheidung + Begründung und Beleg nachreichen. Die vorhandenen Reviewer-Aktionen und Voice-Unterstützung ersetzen diese offenen Wünsche nicht.
- [ ] Dashboard: „Ask your data“-Chat.
- [ ] Umfang des geplanten Quality-Kreislaufs klären; Versionsvergleich und Reviewer-Auswertung existieren bereits.
- [ ] Abschließender UI-Feinschliff.

### Live-Verifikation und Organisation
- [ ] Gemeinsame Supabase: Anwendung der Reject-/Review-Lifecycle-Migrationen prüfen; Reject und Override mit Grund, Reviewer und Policy-Version im Live-Demo testen.
- [ ] Policy-Wechsel live prüfen: betroffene offene Fälle markieren, geschlossene Entscheidungen erhalten.
- [ ] Mit dem Taktile-Mentor offene fachliche Fragen zu Edge Cases und Kostenannahmen klären; vorhandene Tests sind keine Bestätigung eines Mentor-Gesprächs.
- [ ] Louis: Vercel-Zugang für `lj-comstruct` prüfen; aktueller Zugangsstatus hier nicht verifiziert.
- [ ] Nach dem Hackathon: Supabase-Secret-Key und betroffenes Passwort rotieren; Demo-Accounts deaktivieren.

## Zusätzlich im Code erledigt
- [x] Reject: Migration `20261108010000_review_reject.sql` vorhanden; Reject-Aktion in `claim-detail.tsx` freigeschaltet, mit Bestätigung vor dem Speichern.
- [x] Decision Quality: offizieller V1/V2-Vergleich und geänderte offene Fälle in „Example quality“; V2-Erwartungen als team-abgeleitet gekennzeichnet.
- [x] Policy-Seite: gemeinsame Navigation mit Versionen links, Eingabe für Änderungen und manueller Bearbeitung; Entwurf → Impact-Vorschau → Aktivierung. Kein Layout-Umschalter mehr.

## Erledigt
- [x] Reviewer-Inbox: Filter nach Empfehlung/Status, älteste zuerst (nach Eingangsdatum), Warteschlangen-Position. Standardfilter aktuell: alle Empfehlungen und Status.
- [x] Fallseite mit Zurück/Vor/Weiter
- [x] Reviewer-Aktionen: Send to routine, Request info und Reject — Speicherung über Supabase implementiert (Jury-Override)
- [x] Mock-Eingangsdaten (received_at) für DEV-001–014; 14 Testfälle in Supabase eingespielt
- [x] Dashboard: Zeitfilter, Kreisdiagramm, Wochen-Chart, Where to act, Reasons, Most missing info, Quote vs. Limit (versionsunabhängig)
- [x] Dashboard: Vergangenheit bleibt (Entscheidung zum Eingang) + „Needs recheck after policy change“
- [x] Dashboard: Reviewer activity mit Audit Log, Reviewer-Filter, Graph „New vs. completed reviews“
- [x] Savings-Karte pro Zeitraum mit editierbaren Minutenwerten und Stundensatz; Rechenweg im Dialog — siehe [Savings-Modell](savings-model.md).
- [x] Taktile-Design app-weit
- [x] Claimant-Formular `/claim` (Louis), Reviewer-Aktionen in Supabase (Maxi), Supabase-Login eingerichtet
- [x] Review Queue wie Gmail: Liste links (max ¼, verschiebbar wie Apple Mail), Claim rechts, Esc schließt
- [x] Fallseite schlank: „Why it needs you“, „Next step“ (regelbasiert), Reviewer-Aktionen, Fakten in 3 Spalten
- [x] Farbsystem: Grün Routine, Gelb fehlende Infos, Rot Human Review, Indigo nur Recheck
- [x] Claim-Formular: Vollständigkeits-Check mit „Continue filling out“ / „Send anyway“
- [x] „File a claim“ nur für Claimants
