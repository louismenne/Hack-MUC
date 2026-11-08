# Savings-Karte im Dashboard: worauf die Zahlen beruhen

Code: `src/savings.ts` · Karte: `SavingsCard` in `web/src/components/quality-view.tsx` · Tests: `tests/savings.test.ts`

## In einem Satz (für den Pitch)
„Wir zählen, wohin das System jeden Claim im gewählten Zeitraum geschickt hat, und rechnen mit vorsichtigen Minutenwerten, wie viel Triage-Zeit ein Mensch dadurch nicht mehr aufwenden muss.“

## Was Fakt ist und was Annahme
| | Herkunft |
|---|---|
| Anzahl Claims im Zeitraum (Today, 7d, 30d …) | **Fakt**: Eingangsdatum der Claims |
| Wie viele davon Routine / Info-Anfrage / Human Review | **Fakt**: Entscheidung der Policy beim Eingang |
| Minuten pro Weg, Stundensatz | **Annahme**, im Dialog „How it's calculated“ änderbar |

## Rechnung
- **Vorher (manuell):** Jeder Claim wird von einer Person triagiert: Claims × 15 min.
- **Jetzt:** Routine × 2 min (Stichprobe) + Info-Anfrage × 5 min (Entwurf prüfen und senden) + Human Review × 15 min.
- **Gespart** = Vorher − Jetzt, in Stunden und × 40 €/h.

Beispiel 30 Tage (Stand Demo-Daten): 10 Claims (2 Routine, 3 Info, 5 Review) → 150 min vorher, 94 min jetzt → **≈ 0,9 h, −37 %, ≈ 37 €**.

## Warum diese Werte (bewusst vorsichtig)
- **15 min manuelle Triage:** nur der erste Schritt (Unterlagen lesen, Deckung prüfen, nächsten Schritt festlegen), nicht die ganze Schadenbearbeitung. Für einfache Kfz-Schäden eher die untere Hälfte des üblichen Rahmens von ca. 10–30 min.
- **Human Review = 15 min:** Wir behaupten **keine** Beschleunigung bei Reviews, obwohl die Fallseite die Fakten schon aufbereitet. Das ist der größte „Puffer nach unten“.
- **Routine = 2 min statt 0:** Ein Mensch schaut automatisierte Fälle trotzdem kurz an (Stichprobe/Freigabe).
- **Info-Anfrage = 5 min:** Das System schreibt die Liste der fehlenden Unterlagen; ein Mensch prüft und schickt sie.
- **40 €/h Vollkosten:** Sachbearbeitung Kfz-Schaden in DE etwa 50–55 Tsd. € brutto plus ca. 20–25 % Arbeitgeberkosten, verteilt auf ca. 1.600 produktive Stunden pro Jahr.
- **Nicht eingerechnet:** vermiedene Fehlzahlungen. Dafür müssten wir eine Fehlerquote des manuellen Prozesses erfinden. Fehlerquoten messen wir stattdessen getrennt auf den gelabelten Fällen („Example quality“).

## Mögliche Rückfragen der Jury
- *„Warum so wenig Ersparnis?“* Die Demo-Daten enthalten mit Absicht viele schwierige Fälle (50 % Review). Bei einem realen Mix mit mehr Routinefällen steigt die Ersparnis linear mit dem Routine-Anteil.
- *„Woher die Minuten?“* Es sind Annahmen. Sie stehen offen in der App, sind änderbar, und die Rechnung ist darunter sichtbar.
- *„Gilt das nach dem Policy-Wechsel noch?“* Ja. Gezählt wird die Entscheidung beim Eingang; v2 schickt mehr Fälle in Review, und das senkt die Ersparnis ehrlich.
