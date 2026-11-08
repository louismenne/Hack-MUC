# To-do Liam — Hackathon Taktile (Stand: Sa, 7. Nov 2026, nachts)

Detail-Backlog zur Reviewer-UI: [backlog-reviewer-ui.md](backlog-reviewer-ui.md)

## Offen

### 1. Reject (b) freischalten
- [ ] Maxi: Ergebnis „rejected“ im gespeicherten Review-Modell (Supabase `record_review`) ergänzen
- [ ] Danach den deaktivierten „Reject claim“-Knopf in `claim-detail.tsx` freischalten

### 2. Savings-Karte
- [x] Pro Zeitraum (Today/7d/30d…), nur Zeit + Personalkosten, Rechenweg im Dialog — Basis: docs/savings-model.md
- [ ] Minutenwerte und Stundensatz mit Louis' Business Case abgleichen (25 % der Bewertung)

### 3. Claimant-Seite: Infos nachreichen
- [ ] Ansicht, in der der Claimant nach c) / d) fehlende Infos/Dokumente ergänzt (Formular `/claim` existiert, von Louis)

### 4. Dashboard-Feinschliff
- [ ] Decision Quality / Vorher-Nachher: klären, ob im Dashboard oder im Tab „Example quality“ (Maxi)
- [ ] Quality Report als Kreislauf zeigen: messen → Fehler zeigen → Regel anpassen → alte Fälle neu rechnen → freigeben
- [ ] UI-Feinschliff zum Schluss

### 4b. Policy-Seite schlanker (Whiteboard: Pfeil Owner → Maxi, schräg rechts unten)
- [ ] Policy-Tab für den Owner leaner machen: weniger Text, klarer Ablauf Regel ändern → Vorschau → aktivieren
- [ ] Am Whiteboard-Pfeil orientieren: Owner gibt Policy-Änderung → Engine (Maxi) übernimmt

### 5. Mit dem Taktile-Mentor klären
- [ ] Edge Cases: leere/unlesbare Felder, Betrag genau am Limit, mehrere Auslöser, geschlossene Fälle nach Policy-Wechsel
- [ ] Cost-Cutting: was genau gemeint ist (Kosten pro Review, Einsparung, Kosten einer Policy-Änderung)

### 6. Organisatorisch
- [ ] Louis: Vercel-Zugang für `lj-comstruct` (sonst werden deine Deployments blockiert)
- [ ] Nach dem Hackathon: Supabase-Secret-Key rotieren, eigenes Passwort ändern (beides stand im Chat)

## Erledigt
- [x] Reviewer-Inbox: nur Review-Fälle, älteste zuerst (nach Eingangsdatum), Warteschlangen-Position
- [x] Fallseite mit Zurück/Vor/Weiter
- [x] Reviewer-Entscheidung a) Approve, c) Contact claimant, d) Return missing info, Keep in review — gespeichert in Supabase (Jury-Override)
- [x] Mock-Eingangsdaten (received_at) für DEV-001–014; 14 Testfälle in Supabase eingespielt
- [x] Dashboard: Zeitfilter, Kreisdiagramm, Wochen-Chart, Where to act, Reasons, Most missing info, Quote vs. Limit (versionsunabhängig)
- [x] Dashboard: Vergangenheit bleibt (Entscheidung zum Eingang) + „Needs recheck after policy change“
- [x] Dashboard: Reviewer activity mit Audit Log, Reviewer-Filter, Graph „New vs. completed reviews“
- [x] Savings-Karte (erste Version, siehe Offen #2)
- [x] Taktile-Design app-weit
- [x] Claimant-Formular `/claim` (Louis), Reviewer-Aktionen in Supabase (Maxi), Supabase-Login eingerichtet
- [x] Review Queue wie Gmail: Liste links (max ¼, verschiebbar wie Apple Mail), Claim rechts, Esc schließt
- [x] Fallseite schlank: „Why it needs you“, „Next step“ (regelbasiert), Knöpfe gruppiert (Release / Ask claimant / Stop), Fakten in 3 Spalten
- [x] Farbsystem: Grün Routine, Gelb fehlende Infos, Rot Human Review, Indigo nur Recheck
- [x] Claim-Formular: Vollständigkeits-Check mit „Continue filling out“ / „Send anyway“
- [x] „File a claim“ nur für Claimants
