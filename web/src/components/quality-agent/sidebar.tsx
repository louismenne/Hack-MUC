import { useState } from 'react';
import { cn } from '@/lib/utils';
import { QualityAgentChat } from './chat';

/**
 * Collapsible right-hand panel for the quality agent. From xl it sits beside the page (the app adds matching
 * right padding); narrower screens get it as an overlay, full width on phones. Pages ignore Esc inside
 * `data-agent-panel`, so Esc here only collapses the panel.
 */
export function QualityAgentSidebar({ open, onClose, onBusyChange }: { open: boolean; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  // Mount on first open (no API call for people who never use it), then keep the chat alive while collapsed.
  const [visited, setVisited] = useState(open);
  if (open && !visited) setVisited(true);
  return (
    <aside id="quality-agent-panel" data-agent-panel aria-labelledby="quality-agent-title" inert={!open}
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select, [role="menu"], [role="listbox"]')) return;
        event.preventDefault();
        onClose();
      }}
      className={cn(
        'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none sm:w-[420px] md:top-14 md:z-20 xl:shadow-none',
        open ? 'visible translate-x-0' : 'invisible translate-x-full',
      )}>
      {visited && <QualityAgentChat active={open} onClose={onClose} onBusyChange={onBusyChange} />}
    </aside>
  );
}
