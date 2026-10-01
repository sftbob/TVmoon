import { getVideoTransferInfo } from './video-transfer';

export interface DownloadItem {
  id: string;
  title: string;
  episode: number;
  url: string;
}

export const MAX_DOWNLOAD_ITEMS = 500;

export function readDownloadItems(value: unknown): DownloadItem[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DownloadItem>();
  for (const item of value.slice(0, MAX_DOWNLOAD_ITEMS)) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      item.id.length > 500 ||
      typeof item.title !== 'string' ||
      item.title.length > 200 ||
      !Number.isInteger(item.episode) ||
      item.episode < 1 ||
      typeof item.url !== 'string' ||
      item.url.length > 16384
    )
      continue;
    const info = getVideoTransferInfo(item.url);
    if (info)
      unique.set(item.id, {
        id: item.id,
        title: item.title,
        episode: item.episode,
        url: info.url,
      });
  }
  return Array.from(unique.values());
}

// The same episode/source replaces an older, potentially expired playback URL.
export function mergeDownloadItems(
  current: DownloadItem[],
  incoming: DownloadItem[]
) {
  const unique = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => unique.set(item.id, item));
  return Array.from(unique.values()).slice(0, MAX_DOWNLOAD_ITEMS);
}

export function makeDownloadJob(
  items: DownloadItem[],
  parallel: number,
  fragments: number
) {
  return {
    version: 1,
    parallel: Math.max(1, Math.min(3, Math.trunc(parallel) || 2)),
    fragments: [1, 2, 4, 8].includes(fragments) ? fragments : 4,
    items: readDownloadItems(items),
  };
}
