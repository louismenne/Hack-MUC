import { useRef, useState } from 'react';
import { FileTextIcon, ImageIcon, Loader2Icon, UploadIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ACCEPT_ATTRIBUTE, formatSize } from './files.js';

interface Props {
  files: File[];
  reading: boolean;
  notice: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

/** Drag & drop plus file picker for PDFs and images (several at once). */
export function FileDropzone({ files, reading, notice, onAdd, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add documents: drop files here or press Enter to choose files"
        onClick={() => input.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onAdd(Array.from(e.dataTransfer.files)); }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
        )}
        data-testid="dropzone"
      >
        <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Drop documents here, or click to choose</p>
        <p className="text-xs text-muted-foreground">PDF or images: incident report, repair quote, photos. You can add several files.</p>
        <input ref={input} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="sr-only" tabIndex={-1} data-testid="file-input"
          onChange={e => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>

      {reading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden /> Reading documents...</p>}
      {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}

      {files.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Attached documents">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              {file.type.startsWith('image/') ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
              <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${file.name}`} onClick={() => onRemove(index)}><XIcon /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
