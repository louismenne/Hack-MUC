import { SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FieldDef } from './fields.js';
import { todayString } from './validation.js';

interface Props {
  field: FieldDef;
  value: string;
  error?: string;
  aiFilled: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
}

/** One form field, rendered from its definition in fields.ts. */
export function FieldControl({ field, value, error, aiFilled, onChange, onConfirm }: Props) {
  const id = `field-${field.key}`;
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': field.required || undefined };

  const label = (
    <span className="text-sm font-medium">
      {field.label}{field.required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
      {!field.required && <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>}
    </span>
  );

  let control;
  if (field.kind === 'choice') {
    control = (
      <ToggleGroup type="single" variant="outline" value={value} onValueChange={next => onChange(next ?? '')} aria-labelledby={`${id}-label`} aria-describedby={describedBy} data-field-focus>
        {field.options?.map(option => (
          <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label} className="px-4">{option.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  } else if (field.kind === 'textarea') {
    control = <Textarea {...common} rows={5} maxLength={field.maxLength} placeholder={field.placeholder} value={value} onChange={e => onChange(e.target.value)} data-field-focus />;
  } else {
    control = (
      <Input
        {...common}
        type={field.kind === 'email' ? 'email' : field.kind === 'date' ? 'date' : 'text'}
        inputMode={field.kind === 'number' ? 'decimal' : undefined}
        autoComplete={field.kind === 'email' ? 'email' : field.key === 'claimant_name' ? 'name' : 'off'}
        max={field.kind === 'date' ? todayString(new Date()) : undefined}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        data-field-focus
      />
    );
  }

  return (
    <div data-field={field.key} className={cn('flex flex-col gap-2 rounded-lg', aiFilled && 'bg-amber-50 p-3 ring-1 ring-amber-300 dark:bg-amber-400/10 dark:ring-amber-400/40')}>
      {field.kind === 'choice'
        ? <div id={`${id}-label`}>{label}</div>
        : <Label htmlFor={id} className="block">{label}</Label>}
      {field.help && <p id={`${id}-help`} className="text-xs text-muted-foreground">{field.help}</p>}
      {control}
      {aiFilled && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300"><SparklesIcon aria-hidden /> Filled by AI, please check</Badge>
          <Button type="button" size="xs" variant="ghost" onClick={onConfirm}>Looks right</Button>
        </div>
      )}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
