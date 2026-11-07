# To-do Liam — Hackathon Taktile (Stand: Sa, 7. Nov 2026, spätabends)

Detail-Backlog zur Reviewer-UI: [backlog-reviewer-ui.md](backlog-reviewer-ui.md)

## Offen

### 1. Reject (b) freischalten
- [ ] Maxi: Ergebnis „rejected“ im gespeicherten Review-Modell (Supabase `record_review`) ergänzen
- [ ] Danach den deaktivierten „Reject claim“-Knopf in `claim-detail.tsx` freischalten

### 2. Savings-Karte überarbeiten
- [ ] „€… saved in total“ entfernen (mischt zwei Schätzungen)
- [ ] Hauptzahl: „−X % manual reviews“ (aus Daten), darunter „≈ Y staff hours“ als Schätzung
- [ ] Kosten eines falsch bezahlten Claims nicht erfinden: = Betrag des Claims (`quote_eur`, max. Limit) → „€ claim value processed automatically · Fehlerquote auf Testfällen“
- [ ] Annahmen mit Louis' Business Case abgleichen (25 % der Bewertung)

### 3. Claimant-Seite: Infos nachreichen
- [ ] Ansicht, in der der Claimant nach c) / d) fehlende Infos/Dokumente ergänzt (Formular `/claim` existiert, von Louis)

### 4. Dashboard-Feinschliff
- [ ] Decision Quality / Vorher-Nachher: klären, ob im Dashboard oder im Tab „Example quality“ (Maxi)
- [ ] Quality Report als Kreislauf zeigen: messen → Fehler zeigen → Regel anpassen → alte Fälle neu rechnen → freigeben
- [ ] UI-Feinschliff zum Schluss

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
