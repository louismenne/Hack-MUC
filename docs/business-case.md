# Business case: assumptions, sources and logic

Opened from **Overview → Business case → Open business case** (`/business-case`). Code: `src/business-case.ts`,
tests: `tests/business-case.test.ts`. Every input is editable on the page; error rates are measured live on the labelled test cases.
The same sources are listed at the bottom of the page.

## What Taktile asks for, and where it is
1. **Annual triage cost today vs. with the system, net benefit, payback**: section 1 and the three numbers on top.
2. **Cost of errors with the measured error rates under v1 and v2**, and how it shapes thresholds: section 2.
3. **Cost of a policy change today vs. with the system, v2 as the example**: section 3 (counted 3× per year in the net benefit).

## Sources (primary only)
1. **GDV** – ~9 million motor claims settled in 2023, ~€30 bn claims expenditure: [press release](https://www.gdv.de/gdv/medien/medieninformationen/qualitaetsstandards-koennen-streit-ueber-kfz-schadensgutachten-vermeiden-185538)
2. **GDV** – ~2 million glass claims in 2023: [press release](https://www.gdv.de/gdv/medien/medieninformationen/glasbruch-schaeden-auto-statistik-kfz-versicherung-182344)
3. **GDV** – ~10 % of reported claims show irregularities, about half of them in motor: [dossier insurance fraud](https://www.gdv.de/gdv/themen/schaden-unfall/versicherungsbetrug)
4. **Destatis** – average labour cost €45.00 per hour worked in 2025, employer contributions included: [press release](https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/04/PD26_148_624.html)
5. **Bundesagentur für Arbeit** – insurance clerks: median gross €5,534 per month: [Entgeltatlas](https://web.arbeitsagentur.de/entgeltatlas/beruf/136116)

## Assumptions
| Assumption | Default | Basis |
|---|---|---|
| Claims per year | 60,000 | ≈ 0.7 % of ~9 m (source 1): a mid-sized insurer |
| Staff cost per hour | €45 | Average labour cost (source 4); insurance clerks earn more (source 5), so this is cautious |
| Routine share with system | 40 % | Glass alone is ~2 of ~9 m claims (sources 1, 2); plus small bodywork |
| Wrongly waved through today | 0.5 % | Far below the ~10 % of claims with irregularities (source 3) |
| Cost of a wrong payment | €1,000 | ≈ 30 % of the average claim (€30 bn ÷ 9 m ≈ €3,300, source 1): only the overpaid part |
| Manual triage today | 15 min | **Our estimate** (no public benchmark) |
| With system: routine / info / review | 2 / 5 / 15 min | **Our estimate**; review gets no speed-up |
| Information share | 20 % | **Our estimate** |
| Error floor with system | 0.2 % | **Our estimate**: 14 test cases cannot prove zero errors |
| One-off rollout / running per year | €250,000 / €120,000 | **Our estimate**, to be replaced by a vendor quote |
| Policy changes per year | 3 | **Our estimate** |
| Policy change today | 25 reviewers × 2 h, 3,000 open claims × 10 min | **Our estimate** |
| Policy change with system | Owner 4 h; review only flagged claims (14 % in the v2 example) | Measured + **our estimate** |

## Results with the defaults
- Triage: €675k → €471k per year (incl. €120k running cost)
- Errors: €300k → €120k per year
- One policy change: ≈ €25k → ≈ €5k, three per year
- **Net benefit ≈ €443k per year, payback ≈ 6.8 months**

## Thresholds
One wrong payment (€1,000) costs as much as ~89 unnecessary reviews (≈ €11 each). So every uncertain or borderline case goes to a person, and blank fields are never guessed.

## Measured error rates (labelled development cases)
- v1 rules on v1 cases: 0 % wrong routine
- **v1 rules after the v2 change: 14 % wrong routine** (2 of 14): the cost of not updating a policy
- v2 rules on v2 cases: 0 % wrong routine

## Honest limits (say this if asked)
- Minutes per claim, rollout and running cost have no public benchmark; they are our cautious estimates.
- The test set is small (14 cases) and deliberately hard; hence the 0.2 % error floor.
