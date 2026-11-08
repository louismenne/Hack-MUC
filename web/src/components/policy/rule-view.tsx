import { useState } from 'react';
import { ChevronRightIcon, SparklesIcon } from 'lucide-react';
import type { Condition, FieldDef, Leaf, Rule } from '../../../../src/policy-engine/schema';
import { describeLeaf, fieldLabel, groupChildren, groupHeading, groupKind, outcomeLabels } from '../../../../src/policy-view/describe';
import { parseEditedValue, type LeafPath } from '../../../../src/policy-view/edit';
import type { Scalar } from '../../../../src/policy-engine/schema';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toneClasses, dotClasses } from '@/components/recommendation-badge';

type Fields = Record<string, FieldDef>;
const nativeSelect = 'h-7 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

export function OutcomeBadge({ outcome }: { outcome: keyof typeof outcomeLabels }) {
  return (
    <Badge variant="outline" className={cn(toneClasses[outcome])}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[outcome])} />
      {outcomeLabels[outcome]}
    </Badge>
  );
}

const asText = (v: Leaf['value']) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
const OP_PREFIX: Record<string, string> = { eq: 'ist', neq: 'ist nicht', gt: 'ist größer als', gte: 'ist mindestens', lt: 'ist kleiner als', lte: 'ist höchstens', in: 'ist eines von', not_in: 'ist keines von' };

/** A condition whose value can be changed (numbers, true/false, text, lists). */
function EditableLeaf({ leaf, fields, onChange }: { leaf: Leaf; fields: Fields; onChange: (value: Scalar | Scalar[]) => void }) {
  const def = fields[leaf.field];
  const asList = leaf.op === 'in' || leaf.op === 'not_in';
  const [text, setText] = useState(asText(leaf.value));
  const [invalid, setInvalid] = useState(false);
  const label = fieldLabel(fields, leaf.field);
  const prefix = <span>{label} {OP_PREFIX[leaf.op]}</span>;
  if (def?.type === 'boolean') {
    return (
      <span className="flex flex-wrap items-center gap-2">{prefix}
        <select aria-label={label} className={nativeSelect} value={String(leaf.value)} onChange={e => onChange(e.target.value === 'true')}>
          <option value="true">ja</option><option value="false">nein</option>
        </select>
      </span>
    );
  }
  if (def?.type === 'enum' && !asList) {
    return (
      <span className="flex flex-wrap items-center gap-2">{prefix}
        <select aria-label={label} className={nativeSelect} value={String(leaf.value)} onChange={e => onChange(e.target.value)}>
          {def.values?.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">{prefix}
      <Input aria-label={label} aria-invalid={invalid} className={cn('h-7 w-40', invalid && 'border-destructive')} inputMode={def?.type === 'number' ? 'decimal' : 'text'} value={text}
        onChange={e => {
          setText(e.target.value);
          const parsed = parseEditedValue(def, e.target.value, asList);
          setInvalid(parsed === null);
          if (parsed !== null) onChange(parsed);
        }} />
      {asList && <span className="text-xs text-muted-foreground">Werte mit Komma trennen</span>}
      {invalid && <span className="text-xs text-destructive">ungültiger Wert</span>}
    </span>
  );
}

export function ConditionTree({ cond, fields, path, onLeaf }: { cond: Condition; fields: Fields; path: LeafPath; onLeaf?: (path: LeafPath, value: Scalar | Scalar[]) => void }) {
  const kind = groupKind(cond);
  if (kind === 'leaf') {
    const leaf = cond as Leaf;
    const editable = onLeaf && leaf.value !== undefined;
    return <li className="py-0.5 text-sm">{editable ? <EditableLeaf leaf={leaf} fields={fields} onChange={v => onLeaf(path, v)} /> : describeLeaf(leaf, fields)}</li>;
  }
  return (
    <li className="py-0.5 text-sm">
      <div className="text-muted-foreground">{groupHeading(kind as 'all' | 'any')}</div>
      <ul className="ml-1 mt-1 space-y-0.5 border-l-2 pl-3">
        {groupChildren(cond).map((child, i) => <ConditionTree key={i} cond={child} fields={fields} path={[...path, i]} onLeaf={onLeaf} />)}
      </ul>
    </li>
  );
}

/** Small inline form to ask Claude for a change to one rule. */
function AskAi({ ruleId, available, busy, onSubmit }: { ruleId: string; available: boolean; busy: boolean; onSubmit: (instruction: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return <Button size="sm" variant="outline" disabled={!available || busy} title={available ? undefined : 'KI nicht verfügbar, bitte manuell bearbeiten.'} onClick={() => setOpen(true)}><SparklesIcon />Mit KI ändern</Button>;
  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
      <label className="block text-sm font-medium" htmlFor={`ai-${ruleId}`}>Anweisung für Regel „{ruleId}“</label>
      <Textarea id={`ai-${ruleId}`} rows={2} maxLength={1000} placeholder="z. B. Grenze auf 1.200 € senken" value={text} onChange={e => setText(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => { onSubmit(text.trim()); setText(''); setOpen(false); }}>Entwurf von Claude erstellen lassen</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
      </div>
      <p className="text-xs text-muted-foreground">Claude schlägt nur einen Entwurf vor. Du prüfst Diff und Folgen, bevor etwas aktiv wird.</p>
    </div>
  );
}

interface RuleCardProps {
  index: number | null;
  rule: Pick<Rule, 'id' | 'description' | 'outcome'> & { when?: Condition };
  fields: Fields;
  isDefault?: boolean;
  onLeaf?: (path: LeafPath, value: Scalar | Scalar[]) => void;
  ai?: { available: boolean; busy: boolean; onSubmit: (instruction: string) => void };
}

export function RuleCard({ index, rule, fields, isDefault, onLeaf, ai }: RuleCardProps) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {index !== null && <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium" aria-label={`Priorität ${index + 1}`}>{index + 1}</span>}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{rule.id}</code>
        {isDefault && <Badge variant="secondary">Standard, wenn keine Regel passt</Badge>}
        <span className="ml-auto"><OutcomeBadge outcome={rule.outcome} /></span>
      </div>
      <p className="mt-2 text-sm">{rule.description}</p>
      {rule.when && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bedingung</div>
          <ul><ConditionTree cond={rule.when} fields={fields} path={[]} onLeaf={onLeaf} /></ul>
        </div>
      )}
      {ai && <AskAi ruleId={rule.id} {...ai} />}
    </li>
  );
}


type RuleLike = Pick<Rule, 'id' | 'description' | 'outcome'> & { when?: Condition };

/** One rule as a single line; click to see its conditions. */
export function RuleRow({ index, rule, fields }: { index: number | null; rule: RuleLike; fields: Fields }) {
  const [openRow, setOpenRow] = useState(false);
  return (
    <li>
      <button type="button" onClick={() => rule.when && setOpenRow(!openRow)} aria-expanded={rule.when ? openRow : undefined}
        className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left', rule.when && 'hover:bg-muted/40')}>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">{index === null ? '–' : index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm" title={rule.description}>{index === null ? 'Sonst' : rule.description}</span>
        <OutcomeBadge outcome={rule.outcome} />
        {rule.when && <ChevronRightIcon className={cn('size-4 shrink-0 text-muted-foreground transition-transform', openRow && 'rotate-90')} />}
      </button>
      {openRow && rule.when && (
        <div className="px-11 pb-3">
          <p className="mb-1 text-sm">{rule.description}</p>
          <ul><ConditionTree cond={rule.when} fields={fields} path={[]} /></ul>
        </div>
      )}
    </li>
  );
}
