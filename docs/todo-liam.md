# To-do Liam — Hackathon Taktile (Stand: Sa, 7. Nov 2026)

Detail-Backlog zur Reviewer-UI: [backlog-reviewer-ui.md](backlog-reviewer-ui.md)

## 1. Quality Report (laufender Verbesserungs-Kreislauf)
- [ ] Eigener Tab „Quality report“ statt Teil des Owner-Dashboards
- [ ] Pro Policy-Version berichten: Anteil korrekt, falsch auf Routine, unnötige Eskalation
- [ ] Geänderte Fälle (v1 → v2) separat zeigen
- [ ] Kreislauf sichtbar machen: messen → Fehler zeigen → Regel anpassen → alte Fälle neu durchrechnen → freigeben
- [ ] Zeigen, wie Overrides und spätere echte Ergebnisse einfließen (es gibt im Betrieb keine Labels)
- [ ] Für die Demo: Vorher/Nachher-Report v1 vs. v2

## 2. Owner-Dashboard
- [ ] Reviewer-Bereich neu: Graph „Eingang vs. erledigt“ pro Tag/Woche mit % Veränderung (Option 1, echte Audit-Daten statt Mock — noch bestätigen)
- [ ] Decision-Quality-Block raus aus dem Dashboard, nur „Wrongly sent to routine“ als Kennzahl behalten
- [ ] V2 (ca. 18:00): Quote-Limit von v2 in `quoteLimits` ergänzen (`web/src/components/quality-view.tsx`)
- [ ] V2-Claims mit `received_at` ab 25. Okt einspielen
- [ ] Optik/UI-Feinschliff später (erst Sinn, dann schön)

## 3. Input-Arten in jeder UI
- [ ] Pro UI klären, welche Eingaben es gibt (z. B. CSV-Upload, Einzel-Claim-Formular, Reviewer-Entscheidung, Policy-Änderung) und dass jede UI die passenden Eingabearten anbietet

## 4. Mit dem Taktile-Mentor klären
- [ ] **Edge Cases**: z. B. leere/unlesbare Felder, Betrag genau am Limit, mehrere Auslöser gleichzeitig, geschlossene Fälle nach Policy-Wechsel
- [ ] **Entscheidungen des Human in the Loop**: Welche Optionen soll der Reviewer haben (z. B. Infos nachfordern, Freigabe zu Routine, ablehnen/eskalieren)?
- [ ] **Jury-Override**: Reicht Override nur bei automatisch entschiedenen Fällen, oder auch bei Human-Review-Fällen?

## 5. Organisatorisch
- [ ] Branch `liam/quality-dashboard` committen + PR erstellen, wenn Dashboard steht
- [ ] Louis: Vercel-Zugang für `lj-comstruct`, sonst werden Deployments blockiert
