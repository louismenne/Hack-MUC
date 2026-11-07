/** Attachments: PDFs and images. There is no size limit for now. */

export const ACCEPT_ATTRIBUTE = 'application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.bmp,.tif,.tiff';
const EXTENSION = /\.(pdf|png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

export const isAcceptedFile = (file: { name: string; type: string }): boolean =>
  file.type === 'application/pdf' || file.type.startsWith('image/') || EXTENSION.test(file.name);

export const fileKey = (file: { name: string; size: number; lastModified?: number }): string => `${file.name}|${file.size}|${file.lastModified ?? 0}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AddResult { accepted: File[]; rejected: File[]; duplicates: File[] }

/** Sorts newly chosen files into accepted (PDF/image, not already attached), rejected (other types) and duplicates. */
export function sortNewFiles(existing: File[], incoming: File[]): AddResult {
  const known = new Set(existing.map(fileKey));
  const result: AddResult = { accepted: [], rejected: [], duplicates: [] };
  for (const file of incoming) {
    if (!isAcceptedFile(file)) result.rejected.push(file);
    else if (known.has(fileKey(file))) result.duplicates.push(file);
    else { known.add(fileKey(file)); result.accepted.push(file); }
  }
  return result;
}
