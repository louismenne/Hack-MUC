import { useState } from 'react';
import { CalendarIcon, CarIcon, CheckIcon, KeyRoundIcon, SparklesIcon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

/** Presentation only: extra copy and icons for choice cards. The stored values still come from fields.ts. */
const optionCopy: Record<string, { icon: LucideIcon; description: string }> = {
  motor_own_damage: { icon: CarIcon, description: 'Accident, scrape, hail or other damage to your car.' },
  theft: { icon: KeyRoundIcon, description: 'Your car or parts of it were stolen.' },
};

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** "2026-11-07" -> local Date, or undefined for empty/invalid values. */
function parseDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

const isYesNoUnknown = (field: FieldDef) =>
  field.options?.length === 3 && field.options.every(o => o.value === 'yes' || o.value === 'no' || o.value === 'unknown');

/** Label text as one inline run, so markers wrap with the words instead of jumping to their own line. */
function LabelText({ field, showOptional = true }: { field: FieldDef; showOptional?: boolean }) {
  return (
    <span>
      {field.label}
      {field.required && <span aria-hidden className="ml-0.5 text-destructive">*</span>}
      {!field.required && showOptional && <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>}
    </span>
  );
}

function AiNotice({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="status">
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
        <SparklesIcon data-icon="inline-start" /> Filled by AI, please check
      </Badge>
      <Button type="button" size="xs" variant="ghost" onClick={onConfirm}>
        <CheckIcon data-icon="inline-start" /> Looks right
      </Button>
    </div>
  );
}

function DatePicker({ id, value, onChange, invalid, describedBy }: { id: string; value: string; onChange: (value: string) => void; invalid: boolean; describedBy?: string }) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);
  const today = new Date();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
        >
          {selected ? dayFormat.format(selected) : 'Pick a date'}
          <CalendarIcon data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          captionLayout="dropdown"
          weekStartsOn={1}
          startMonth={new Date(2000, 0)}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={day => {
            onChange(day ? todayString(day) : '');
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One form field, rendered from its definition in fields.ts with shadcn Field components. */
export function FieldControl({ field, value, error, aiFilled, onChange, onConfirm }: Props) {
  const id = `field-${field.key}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(error);
  const highlight = aiFilled && 'rounded-lg bg-amber-500/5 p-3 ring-1 ring-amber-500/30';

  const description = field.help && <FieldDescription id={helpId}>{field.help}</FieldDescription>;
  const errorText = error && <FieldError id={errorId}>{error}</FieldError>;
  const aiNotice = aiFilled && <AiNotice onConfirm={onConfirm} />;

  // Yes / No / Don't know: question on the left, radio options on the right (stacked on small screens).
  if (field.kind === 'choice' && isYesNoUnknown(field)) {
    return (
      <Field orientation="responsive" data-invalid={invalid} data-field={field.key} className={cn(highlight)}>
        <FieldContent>
          <FieldTitle id={`${id}-label`}>
            <LabelText field={field} showOptional={false} />
          </FieldTitle>
          {description}
          {aiNotice}
          {errorText}
        </FieldContent>
        <RadioGroup
          value={value}
          onValueChange={onChange}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="flex w-auto shrink-0 flex-wrap gap-x-5 gap-y-2"
        >
          {field.options!.map(option => (
            <Field key={option.value} orientation="horizontal" className="w-auto gap-2">
              <RadioGroupItem value={option.value} id={`${id}-${option.value}`} aria-invalid={invalid || undefined} />
              <FieldLabel htmlFor={`${id}-${option.value}`} className="font-normal whitespace-nowrap">{option.label}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </Field>
    );
  }

  // Other choices: selectable cards.
  if (field.kind === 'choice') {
    return (
      <Field data-invalid={invalid} data-field={field.key} className={cn(highlight)}>
        <FieldTitle id={`${id}-label`}>
          <LabelText field={field} />
        </FieldTitle>
        {description}
        <RadioGroup
          value={value}
          onValueChange={onChange}
          aria-labelledby={`${id}-label`}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="grid gap-3 sm:grid-cols-2"
        >
          {field.options!.map(option => {
            const copy = optionCopy[option.value];
            const Icon = copy?.icon;
            return (
              <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}>
                <Field orientation="horizontal">
                  {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <FieldContent>
                    <FieldTitle>{option.label}</FieldTitle>
                    {copy && <FieldDescription>{copy.description}</FieldDescription>}
                  </FieldContent>
                  <RadioGroupItem value={option.value} id={`${id}-${option.value}`} aria-invalid={invalid || undefined} />
                </Field>
              </FieldLabel>
            );
          })}
        </RadioGroup>
        {aiNotice}
        {errorText}
      </Field>
    );
  }

  const common = {
    id,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
  };

  let control;
  if (field.kind === 'textarea') {
    control = (
      <InputGroup>
        <InputGroupTextarea
          {...common}
          rows={5}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
          className="min-h-28"
        />
        {field.maxLength !== undefined && (
          <InputGroupAddon align="block-end">
            <InputGroupText className="ml-auto text-xs tabular-nums">
              {value.length} / {field.maxLength}
            </InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    );
  } else if (field.kind === 'number') {
    control = (
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>€</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          {...common}
          inputMode="decimal"
          autoComplete="off"
          placeholder={field.placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      </InputGroup>
    );
  } else if (field.kind === 'date') {
    control = <DatePicker id={id} value={value} onChange={onChange} invalid={invalid} describedBy={describedBy} />;
  } else {
    control = (
      <Input
        {...common}
        type={field.kind === 'email' ? 'email' : 'text'}
        autoComplete={field.kind === 'email' ? 'email' : field.key === 'claimant_name' ? 'name' : 'off'}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    );
  }

  return (
    <Field data-invalid={invalid} data-field={field.key} className={cn(highlight)}>
      <FieldLabel htmlFor={id}>
        <LabelText field={field} />
      </FieldLabel>
      {control}
      {description}
      {aiNotice}
      {errorText}
    </Field>
  );
}
