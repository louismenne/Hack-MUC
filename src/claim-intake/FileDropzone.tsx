import { useRef, useState } from 'react';
import { CircleAlertIcon, FileTextIcon, ImageIcon, PaperclipIcon, UploadIcon, XIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { ACCEPT_ATTRIBUTE, formatSize } from './files.js';

interface Props {
  files: File[];
  reading: boolean;
  notice: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

const kindLabel = (file: File) => (file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'PDF' : 'Image');

/** Drag & drop plus file picker for PDFs and images (several at once). */
export function FileDropzone({ files, reading, notice, onAdd, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Empty
        data-testid="dropzone"
        data-dragging={dragging || undefined}
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          onAdd(Array.from(event.dataTransfer.files));
        }}
        className="border border-dashed transition-colors data-dragging:border-primary data-dragging:bg-primary/5"
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UploadIcon />
          </EmptyMedia>
          <EmptyTitle>Drop documents here</EmptyTitle>
          <EmptyDescription>PDF or images: incident report, repair quote, photos. You can add several files at once.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <PaperclipIcon data-icon="inline-start" /> Choose files
          </Button>
        </EmptyContent>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="file-input"
          onChange={event => {
            onAdd(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </Empty>

      {reading && (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Reading documents…
        </div>
      )}

      {notice && (
        <Alert>
          <CircleAlertIcon />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {files.length > 0 && (
        <ItemGroup aria-label="Attached documents" className="gap-2">
          {files.map((file, index) => (
            <Item key={`${file.name}-${index}`} role="listitem" variant="outline" size="sm">
              <ItemMedia variant="icon">
                {kindLabel(file) === 'PDF' ? <FileTextIcon /> : <ImageIcon />}
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="block w-full truncate" title={file.name}>{file.name}</ItemTitle>
                <ItemDescription className="text-xs">{kindLabel(file)} · {formatSize(file.size)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${file.name}`} onClick={() => onRemove(index)}>
                  <XIcon />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
