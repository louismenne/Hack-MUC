# Backlog: Reviewer UI (Liam) — anschauen Samstagabend, 7. Nov

Stand: Maxi hat bereits eine Reviewer-UI auf `main` (React + shadcn, `web/`):
Queue mit Filter nach Empfehlung, Detailansicht mit Begründung, Confirm/Override, Audit-Log, Quality-Tab.
Ziel für Liam: Lücken zum Inbox-Konzept schließen, keine zweite UI bauen.

## Mit Maxi klären
- [x] **Eingangsreihenfolge**: Geklärt mit Maxi — Case-IDs sind chronologisch (1 = ältester Fall).
      Oldest First = aufsteigend nach ID sortieren. Kein `received_at` nötig; Wartezeit in Tagen gibt es damit nicht.
- [ ] **Reason-Kategorien**: Darf die UI die Rule-1-Auslöser zu Kategorien gruppieren? Vorschlag:
  - Deckung fraglich: `policy_active_on_incident=false`, `claim_type` ≠ motor_own_damage
  - Personenschaden: `injury_reported`
  - Haftung strittig: `liability_disputed`
  - Betrugs-/Plausibilitätsverdacht: `duplicate_flag`, `evidence_conflict`
  - Hoher Betrag: `quote_eur` > 1.500 €
  - Achtung: Ein Claim kann mehrere Kategorien haben. Was passiert mit v2-Regeln?
- [ ] **Arbeitsteilung in `web/`**: Welche Dateien darf Liam ändern, ohne Maxi in die Quere zu kommen?
- [ ] **Policy v2 (ca. 18:00)**: Zeigt die Queue danach v2-Empfehlungen und `needs_recheck` für offene Fälle?

## Mit dem Taktile-Mentor klären
- [ ] **Reviewer-Entscheidung bei Human-Review-Fällen**: Sollen wir den Entscheidungsschritt bauen? Geplante Optionen
      (aktuell als deaktivierte Platzhalter in der Fallseite): „Request missing information from claimant“,
      „Release to routine processing“. Gibt es weitere (z. B. Ablehnen, Eskalieren)?
- [ ] **Jury-Override**: Die Jury testet einen Live-Override (Korrektur, Grund, Reviewer, Policy-Version).
      Override ist aktuell nur bei automatisch entschiedenen Fällen (Routine/Info) möglich — reicht das?

## UI-Lücken gegenüber Liams Inbox-Konzept
- [x] Fallseite: Human-Review-Fälle zeigen „Reviewer decision pending“ + Platzhalter statt Confirm/Override;
      bereits entschiedene Fälle haben nur „Override“
- [ ] Standardansicht = nur Human-Review-Fälle (Inbox), Sortierung Oldest First
- [ ] Filter nach Reason-Kategorie (nach Klärung mit Maxi)
- [x] Position in der Warteschlange (#1 = als Nächstes bearbeiten) — gebaut
- [ ] „Offen seit X Tagen“ pro Fall — braucht ein Eingangsdatum; mit Maxi klären, ob/wie es beim Daten-Merge dazukommt
- [ ] Daten-Merge mehrerer CSVs (DEV-, PRA-, Hidden): welche Reihenfolge gilt über verschiedene Präfixe hinweg?
- [x] Klick auf einen Fall öffnet eigene Fallseite (mit „Back to inbox“, Vor/Zurück, Browser-Zurück)
- [ ] Optik: freundlicher, weniger „technisch“ (z. B. Feldnamen wie `quote_eur=1800` in Klartext, weniger Monospace, mehr Weißraum)
- [ ] Später: Routine-Fälle stichprobenartig prüfen (Qualitätskontrolle)
