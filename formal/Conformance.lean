import Policy
open Claims

def boolFact (s : String) : Option Bool :=
  if s == "T" then some true else if s == "F" then some false else none

def textFact (s : String) : Option String := if s == "?" then none else some s

def runLine (line : String) : String := Id.run do
  let a := (line.splitOn "\t").toArray
  let b := fun i => boolFact (a[i]!)
  let c : Claim := {
    active := b 0, report := b 1, itemized := b 2, injury := b 3,
    disputed := b 4, duplicate := b 5, conflict := b 6,
    claimType := textFact a[7]!, repairType := textFact a[8]!,
    quote := a[9]!.toNat?, metadataPresent := a[10]! == "T"
  }
  let p : Policy := {
    limit := a[11]!.toNat!, reviewRepairs := if a[12]! == "T" then ["ev_high_voltage_battery"] else [],
    requireReport := a[13]! == "T", requireQuote := a[14]! == "T"
  }
  return match evaluate p c with
    | .routine => "routine_processing"
    | .information => "request_information"
    | .human => "human_review"

def main (args : List String) : IO Unit := do
  let input ← IO.FS.readFile args[0]!
  let output := input.splitOn "\n" |>.filter (· != "") |>.map runLine
  IO.FS.writeFile args[1]! (String.intercalate "\n" output ++ "\n")
