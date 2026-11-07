import { useEffect, useState } from 'react';
import { recommendationMeta } from '@/lib/policy';
import { RecommendationBadge } from '@/components/recommendation-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { minReasonLength, recommendations, validateReview, type ReviewAction, type ReviewInput } from '../../../src/review';
import type { Decision, Recommendation } from '../../../src/triage';

const copy: Record<ReviewAction, { title: string; description: string; submit: string; reasonLabel: string }> = {
  overridden: {
    title: 'Override recommendation',
    description: 'Your correction is recorded next to the automated decision. The original stays in the audit history.',
    submit: 'Record override',
    reasonLabel: 'Reason for override',
  },
  reverted: {
    title: 'Revert to automated recommendation',
    description: 'This restores the engine’s recommendation. The earlier override stays in the audit history.',
    submit: 'Record revert',
    reasonLabel: 'Reason for revert',
  },
  confirmed: {
    title: 'Confirm recommendation',
    description: 'Record that you agree with the current recommendation.',
    submit: 'Confirm',
    reasonLabel: 'Note (optional)',
  },
};

interface ReviewDialogProps {
  action: ReviewAction | null;
  onOpenChange: (open: boolean) => void;
  datasetId: string;
  decision: Decision & { caseId: string };
  current: Recommendation;
  defaultReviewer: string;
  onSubmit: (input: ReviewInput) => void;
  /** Preselected new recommendation for a reviewer decision (e.g. approve → routine). */
  presetNext?: Recommendation;
  /** Title of the reviewer decision, shown instead of the generic action title. */
  presetTitle?: string;
}

export function ReviewDialog({ action, onOpenChange, datasetId, decision, current, defaultReviewer, onSubmit, presetNext, presetTitle }: ReviewDialogProps) {
  const [next, setNext] = useState<Recommendation | undefined>();
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!action) return;
    setNext(presetNext);
    setReason('');
    setSubmitted(false);
  }, [action, decision.caseId, defaultReviewer, presetNext]);

  const shown = action ?? 'confirmed';
  const text = copy[shown];
  const input: ReviewInput = { datasetId, decision, current, action: shown, reviewer: defaultReviewer, reason, next };
  const errors = submitted ? validateReview(input) : {};

  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-5"
          onSubmit={event => {
            event.preventDefault();
            setSubmitted(true);
            if (Object.keys(validateReview(input)).length === 0) onSubmit(input);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {presetTitle ?? text.title} · <span className="font-mono">{decision.caseId}</span>
            </DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Automated <RecommendationBadge value={decision.recommendation} short />
            <span className="font-mono">{decision.ruleId}</span>
            {current !== decision.recommendation && <>· Current <RecommendationBadge value={current} short /></>}
          </div>
          <FieldGroup>
            {shown === 'overridden' && (
              <Field data-invalid={!!errors.next}>
                <FieldLabel htmlFor="review-next">New recommendation</FieldLabel>
                <Select value={next ?? ''} onValueChange={value => setNext(value as Recommendation)}>
                  <SelectTrigger id="review-next" className="w-full" aria-invalid={!!errors.next}>
                    <SelectValue placeholder="Choose a recommendation" />
                  </SelectTrigger>
                  <SelectContent>
                    {recommendations.filter(rec => rec !== current).map(rec => (
                      <SelectItem key={rec} value={rec}>{recommendationMeta[rec].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.next && <FieldError>{errors.next}</FieldError>}
              </Field>
            )}
            {shown === 'reverted' && errors.next && <FieldError>{errors.next}</FieldError>}
            <Field data-invalid={!!errors.reason}>
              <FieldLabel htmlFor="review-reason">{text.reasonLabel}</FieldLabel>
              <Textarea
                id="review-reason"
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder={shown === 'confirmed' ? 'Anything worth noting for the record' : 'What did you see that the rules did not?'}
                aria-invalid={!!errors.reason}
                rows={3}
              />
              {errors.reason
                ? <FieldError>{errors.reason}</FieldError>
                : shown !== 'confirmed' && <FieldDescription>Required, at least {minReasonLength} characters. Stored in the audit history.</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.reviewer}>
              <FieldLabel htmlFor="review-reviewer">Reviewer</FieldLabel>
              <Input id="review-reviewer" value={defaultReviewer} readOnly placeholder="Your name" autoComplete="name" aria-invalid={!!errors.reviewer} />
              {errors.reviewer && <FieldError>{errors.reviewer}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{text.submit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
