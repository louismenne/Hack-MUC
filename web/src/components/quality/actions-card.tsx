import { useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  LightbulbIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { suggestedActions, type ActionSeverity } from '../../../../src/insights';

const severityMeta: Record<ActionSeverity, { icon: typeof InfoIcon; label: string; className: string }> = {
  critical: {
    icon: OctagonAlertIcon,
    label: 'Critical',
    className: 'border-border bg-transparent text-foreground [&>svg]:text-rec-review',
  },
  warning: {
    icon: TriangleAlertIcon,
    label: 'Attention',
    className: 'border-border bg-transparent text-foreground [&>svg]:text-rec-info',
  },
  info: { icon: InfoIcon, label: 'Opportunity', className: 'border-border bg-muted text-muted-foreground' },
};

function SeverityBadge({ severity }: { severity: ActionSeverity }) {
  const meta = severityMeta[severity];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('w-fit shrink-0 gap-1', meta.className)}>
      <Icon /> {meta.label}
    </Badge>
  );
}

/** Headlines only; the explanation and evidence open in a dialog so the page stays scannable. */
export function ActionsCard({ actions }: { actions: ReturnType<typeof suggestedActions> }) {
  const [open, setOpen] = useState<number | null>(null);
  const action = open === null ? null : actions[open];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LightbulbIcon className="size-4" /> Where to act
          {actions.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">{actions.length}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing stands out across open claims.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {actions.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <SeverityBadge severity={item.severity} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={action !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          {action && open !== null && (
            <>
              <DialogHeader>
                <SeverityBadge severity={action.severity} />
                <DialogTitle className="text-lg leading-snug text-pretty">{action.title}</DialogTitle>
                <DialogDescription className="text-sm text-pretty">{action.detail}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-muted/50 px-3.5 py-2.5 text-sm">
                <div className="text-xs font-medium text-muted-foreground">Based on</div>
                {action.evidence}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {open + 1} of {actions.length}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={open === 0}
                    onClick={() => setOpen(open - 1)}
                    aria-label="Previous suggestion"
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={open === actions.length - 1}
                    onClick={() => setOpen(open + 1)}
                    aria-label="Next suggestion"
                  >
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
