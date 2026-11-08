import Std

namespace Claims

inductive Recommendation where
  | routine | information | human
  deriving DecidableEq, Repr

/-- Money is modeled as exact, nonnegative integer cents. -/
structure Policy where
  limit : Nat
  reviewRepairs : List String
  requireReport : Bool
  requireQuote : Bool
  deriving Repr

structure Claim where
  active : Option Bool
  claimType : Option String
  repairType : Option String
  quote : Option Nat
  report : Option Bool
  itemized : Option Bool
  injury : Option Bool
  disputed : Option Bool
  duplicate : Option Bool
  conflict : Option Bool
  /-- Presence of case_id, case_status and claim_summary, as checked by TypeScript. -/
  metadataPresent : Bool
  deriving Repr

def v1 : Policy := ⟨150000, [], true, true⟩

/-- Official organizer v2 change notice. -/
def v2 : Policy := ⟨120000, ["ev_high_voltage_battery"], true, true⟩

def aboveLimit (p : Policy) (c : Claim) : Bool :=
  c.quote.any (fun q => p.limit < q)

def reviewTrigger (p : Policy) (c : Claim) : Bool :=
  (c.active == some false) ||
  c.claimType.any (fun t => t != "motor_own_damage") ||
  (c.injury == some true) || (c.disputed == some true) ||
  (c.duplicate == some true) || (c.conflict == some true) ||
  aboveLimit p c || c.repairType.any (fun t => p.reviewRepairs.contains t)

def absentDocument (p : Policy) (c : Claim) : Bool :=
  (p.requireReport && c.report == some false) ||
  (p.requireQuote && c.itemized == some false)

def missingInput (p : Policy) (c : Claim) : Bool :=
  !c.metadataPresent || c.active.isNone || c.claimType.isNone || c.repairType.isNone ||
  c.quote.isNone || c.injury.isNone || c.disputed.isNone || c.duplicate.isNone ||
  c.conflict.isNone || (p.requireReport && c.report.isNone) ||
  (p.requireQuote && c.itemized.isNone)

/-- Operational translation of the TypeScript evaluator's ordered branches. -/
def evaluate (p : Policy) (c : Claim) : Recommendation :=
  if reviewTrigger p c then .human
  else if absentDocument p c then .information
  else if missingInput p c then .information
  else .routine

/-- Declarative allowed outcomes, separate from the operational branch ordering. -/
def Allowed (p : Policy) (c : Claim) (r : Recommendation) : Prop :=
  match r with
  | .human => reviewTrigger p c = true
  | .information => reviewTrigger p c = false ∧
      (absentDocument p c = true ∨ missingInput p c = true)
  | .routine => reviewTrigger p c = false ∧
      absentDocument p c = false ∧ missingInput p c = false

/-- Soundness and completeness for every claim and every modeled policy. -/
theorem correct (p : Policy) (c : Claim) (r : Recommendation) :
    evaluate p c = r ↔ Allowed p c r := by
  cases h : reviewTrigger p c <;>
    cases d : absentDocument p c <;>
    cases m : missingInput p c <;>
    cases r <;> simp [evaluate, Allowed, h, d, m]

theorem unique (p : Policy) (c : Claim) (a b : Recommendation)
    (ha : Allowed p c a) (hb : Allowed p c b) : a = b := by
  have ea := (correct p c a).mpr ha
  have eb := (correct p c b).mpr hb
  exact ea.symm.trans eb

/-- A known review trigger wins regardless of document or input completeness. -/
theorem review_precedence (p : Policy) (c : Claim)
    (h : reviewTrigger p c = true) : evaluate p c = .human := by
  simp [evaluate, h]

theorem missing_requests_information (p : Policy) (c : Claim)
    (h : reviewTrigger p c = false) (m : missingInput p c = true) :
    evaluate p c = .information := by
  cases d : absentDocument p c <;> simp [evaluate, h, m, d]

theorem no_unsafe_routine (p : Policy) (c : Claim)
    (h : evaluate p c = .routine) :
    reviewTrigger p c = false ∧ absentDocument p c = false ∧ missingInput p c = false :=
  (correct p c .routine).mp h

/-- The limit itself is allowed by the amount rule; other triggers still apply. -/
theorem exact_boundary (p : Policy) (c : Claim) :
    aboveLimit p { c with quote := some p.limit } = false := by
  simp [aboveLimit]

theorem one_cent_above (p : Policy) (c : Claim) :
    aboveLimit p { c with quote := some (p.limit + 1) } = true := by
  simp [aboveLimit]

theorem above_limit_requires_review (p : Policy) (c : Claim)
    (h : aboveLimit p c = true) : evaluate p c = .human := by
  apply review_precedence
  simp [reviewTrigger, h]

/-- Official v2 battery trigger wins even with unknown quote or missing documents. -/
theorem v2_battery_requires_review (c : Claim)
    (h : c.repairType = some "ev_high_voltage_battery") : evaluate v2 c = .human := by
  apply review_precedence
  simp [reviewTrigger, v2, h]

theorem v2_1200_at_boundary (c : Claim) :
    aboveLimit v2 { c with quote := some 120000 } = false := by
  simp [aboveLimit, v2]

theorem v2_1201_requires_review (c : Claim) :
    evaluate v2 { c with quote := some 120100 } = .human := by
  apply above_limit_requires_review
  simp [aboveLimit, v2]

/-- Lowering a limit cannot eliminate an amount-based review trigger. -/
theorem lower_limit_preserves_amount_review (p : Policy) (c : Claim) (n : Nat)
    (hn : n ≤ p.limit) (h : aboveLimit p c = true) :
    evaluate { p with limit := n } c = .human := by
  apply above_limit_requires_review
  cases q : c.quote with
  | none => simp [aboveLimit, q] at h
  | some amount =>
    have old : p.limit < amount := by simpa [aboveLimit, q] using h
    have new : n < amount := Nat.lt_of_le_of_lt hn old
    simpa [aboveLimit, q] using new

/-- Generic first-match selection after JSON conditions have been evaluated.
Payloads can include the recommendation and rule ID; conditions remain outside this model. -/
def selectFirst {α : Type} (fallback : α) : List (Bool × α) → α
  | [] => fallback
  | (matched, result) :: rest => if matched then result else selectFirst fallback rest

/-- All rules before the selected rule must fail; later rules cannot override it. -/
theorem first_match_wins {α : Type} (fallback result : α)
    (beforeRules suffix : List (Bool × α))
    (h : ∀ rule ∈ beforeRules, rule.1 = false) :
    selectFirst fallback (beforeRules ++ (true, result) :: suffix) = result := by
  induction beforeRules with
  | nil => simp [selectFirst]
  | cons head tail ih =>
    have hh := h head (by simp)
    have ht : ∀ rule ∈ tail, rule.1 = false := by
      intro rule hr
      exact h rule (by simp [hr])
    simpa [selectFirst, hh] using ih ht

/-- If every rule fails, selection returns the default payload. -/
theorem no_match_default {α : Type} (fallback : α) (rules : List (Bool × α))
    (h : ∀ rule ∈ rules, rule.1 = false) : selectFirst fallback rules = fallback := by
  induction rules with
  | nil => rfl
  | cons head tail ih =>
    have hh := h head (by simp)
    have ht : ∀ rule ∈ tail, rule.1 = false := by
      intro rule hr
      exact h rule (by simp [hr])
    simpa [selectFirst, hh] using ih ht

/-- The official three-rule ordering implements the verified decision model. -/
theorem ordered_rules_correct (p : Policy) (c : Claim) :
    selectFirst .routine [(reviewTrigger p c, .human),
      (absentDocument p c, .information), (missingInput p c, .information)] =
      evaluate p c := by
  simp [selectFirst, evaluate]

/-- Version labels cannot affect the pure recommendation. -/
def versioned (version : String) (p : Policy) (c : Claim) := (version, evaluate p c)
theorem version_label_irrelevant (a b : String) (p : Policy) (c : Claim) :
    (versioned a p c).2 = (versioned b p c).2 := rfl

/-- Abstract activation semantics, not a proof of SQL transactions. -/
def transition (closed pending : Bool) (old : Recommendation) (p : Policy) (c : Claim) :
    Recommendation × Bool :=
  if closed then (old, pending)
  else (evaluate p c, pending || (evaluate p c != old))

theorem closed_unchanged (pending : Bool) (old : Recommendation) (p : Policy) (c : Claim) :
    transition true pending old p c = (old, pending) := by simp [transition]

theorem changed_open_flagged (old : Recommendation) (p : Policy) (c : Claim)
    (h : evaluate p c ≠ old) : (transition false false old p c).2 = true := by
  simp [transition, h]

theorem pending_recheck_preserved (closed : Bool) (old : Recommendation) (p : Policy) (c : Claim) :
    (transition closed true old p c).2 = true := by
  cases closed <;> simp [transition]

#print axioms first_match_wins
#print axioms no_match_default
#print axioms ordered_rules_correct
#print axioms correct
#print axioms unique
#print axioms no_unsafe_routine
#print axioms lower_limit_preserves_amount_review
#print axioms closed_unchanged
end Claims
