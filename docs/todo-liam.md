# To-do Liam — Hackathon Taktile (Stand: Sa, 7. Nov 2026, abends)

Detail-Backlog zur Reviewer-UI: [backlog-reviewer-ui.md](backlog-reviewer-ui.md)

## 1. Reviewer-Entscheidung end-to-end (vom Taktile-Mentor bestätigt)
- [ ] Platzhalter „Coming soon“ durch echte Entscheidung ersetzen:
  - a) Approve → weiter in Routine processing
  - b) Reject → Claim ablehnen
  - c) Contact claimant → um genauere Infos bitten (Freitext)
  - d) Return: missing info → fehlende Dokumente anhaken und zurückschicken
    (nötig, weil ein Review-Grund Vorrang vor fehlenden Dokumenten hat, z. B. DEV-014)
- [ ] Jede Entscheidung speichert Reviewer, Begründung, Policy-Version, Zeitstempel (= Jury-Live-Override)
- [ ] Mit Maxi abstimmen: Datenmodell `src/review.ts` erweitern, nicht umbauen

## 2. Claimant-UI (vom Mentor bestätigt: alle UIs bauen)
- [ ] Klären, wer sie baut (Liam / Louis / Maxi)
- [ ] Formular „Claim einreichen“ mit den CSV-Feldern + Dokumente → läuft sofort durch die Engine → erscheint in der Inbox
- [ ] Ansicht „Infos nachreichen“ für Fälle aus c) / d)

## 3. Cost-Cutting-Funktionen (Feedback Mentor) — Details klären
- [ ] Was genau gemeint ist: Kosten pro Claim/Review sichtbar machen? Einsparung durch Automation? Kosten einer Policy-Änderung?
- [ ] Abstimmen mit Louis' Business Case (25 % der Bewertung)

## 4. Owner-Dashboard fertigstellen
- [ ] PR für `liam/quality-dashboard` erstellen + mergen lassen
- [ ] Reviewer-Bereich neu: Graph „Eingang vs. erledigt“ pro Woche mit % Veränderung (echte Audit-Daten)
- [ ] Decision Quality → eigener Tab „Quality report“ (v1 vs. v2, geänderte Fälle separat); im Dashboard nur „Wrongly sent to routine“
- [ ] Audit Log ins Dashboard integrieren: Owner sieht, was der/die Reviewer gemacht haben
      (wer hat wann welchen Fall wie entschieden, mit Begründung + Policy-Version; filterbar nach Reviewer)
- [ ] UI-Feinschliff später (erst Sinn, dann schön)

## 5. Quality Report als laufender Prozess
- [ ] Kreislauf zeigen: messen → Fehler zeigen → Regel anpassen → alte Fälle neu rechnen → freigeben
- [ ] Wie Overrides und spätere echte Ergebnisse einfließen (im Betrieb gibt es keine Labels)

## 6. Mit dem Taktile-Mentor klären
- [ ] Edge Cases: leere/unlesbare Felder, Betrag genau am Limit, mehrere Auslöser, geschlossene Fälle nach Policy-Wechsel
- [ ] Input-Arten je UI (CSV-Upload, Formular, Reviewer-Entscheidung, Policy-Änderung)

## 7. Organisatorisch
- [ ] Louis: Vercel-Zugang für `lj-comstruct`
- [ ] Optional: `.env.local` (Supabase) von Louis privat, nur für den Policy-Tab nötig
