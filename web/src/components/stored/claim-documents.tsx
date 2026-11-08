import { DownloadIcon, FileTextIcon, ImageIcon } from 'lucide-react';

import { supabase } from '@/lib/supabase';

import type { StoredQueueItem } from '../../../../src/policy-api/stored-claims';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

import { toast } from 'sonner';

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);
export function ClaimDocuments({ attachments }: { attachments: StoredQueueItem['claim']['attachments'] }) {
  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from('claim-documents').download(path);
    if (error) {
      toast.error(error.message);
      return;
    }
    const url = URL.createObjectURL(data);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    attachments?.length > 0 && (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {attachments.map((file) => {
              const Icon = isImage(file.name) ? ImageIcon : FileTextIcon;
              return (
                <li key={file.path} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => void download(file.path, file.name)}>
                    <DownloadIcon data-icon="inline-start" /> Download
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    )
  );
}
