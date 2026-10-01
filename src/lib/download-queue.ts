/* eslint-disable no-control-regex -- Contract explicitly rejects control characters. */
import { SearchResult } from './types';

export interface QueueMetadata {
  id: string;
  title: string;
  episode: number;
  source: string;
  sourceId: string;
  sourceName: string;
}
export interface DownloadItem extends QueueMetadata {
  url: string;
}
export const MAX_DOWNLOAD_ITEMS = 500;
export const MAX_HANDOFF_ITEMS = 50;

// Allowlist only: URL and preparedRequest are never serialized, including migration.
export function readQueueMetadata(value: unknown): QueueMetadata[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, QueueMetadata>();
  for (const raw of value.slice(0, MAX_DOWNLOAD_ITEMS)) {
    if (!raw || typeof raw.id !== 'string' || raw.id.length > 500) continue;
    let identity;
    try {
      identity = JSON.parse(raw.id);
    } catch {
      continue;
    }
    if (
      !Array.isArray(identity) ||
      identity.length !== 3 ||
      typeof identity[0] !== 'string' ||
      !/^[\w-]{1,200}$/.test(identity[0]) ||
      typeof identity[1] !== 'string' ||
      !/^[\w-]+$/.test(identity[1]) ||
      !Number.isInteger(identity[2]) ||
      identity[2] < 0 ||
      identity[2] >= 100000 ||
      typeof raw.title !== 'string' ||
      !raw.title.trim() ||
      Array.from(raw.title).length > 200 ||
      /[\x00-\x1f\x7f]|https?:\/\//i.test(raw.title)
    )
      continue;
    unique.set(raw.id, {
      id: raw.id,
      title: raw.title,
      episode: identity[2] + 1,
      source: identity[0],
      sourceId: identity[1],
      sourceName:
        typeof raw.sourceName === 'string' &&
        raw.sourceName.length <= 200 &&
        !/[\x00-\x1f\x7f]|https?:\/\//i.test(raw.sourceName)
          ? raw.sourceName
          : identity[0],
    });
  }
  return Array.from(unique.values());
}
export function metadataFromDetail(
  detail: SearchResult,
  indices: number[]
): QueueMetadata[] {
  const incoming = indices.map((index) => ({
    id: JSON.stringify([detail.source, detail.id, index]),
    title: detail.title,
    sourceName: detail.source_name,
  }));
  const valid = readQueueMetadata(incoming);
  if (valid.length !== incoming.length) throw new Error('INVALID_ITEM');
  return valid;
}
export function mergeQueueMetadata(
  current: QueueMetadata[],
  incoming: QueueMetadata[]
) {
  const unique = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => unique.set(item.id, item));
  if (unique.size > MAX_DOWNLOAD_ITEMS) throw new Error('QUEUE_FULL');
  return Array.from(unique.values());
}
export async function resolveDownloadItems(
  items: QueueMetadata[],
  signal: AbortSignal
): Promise<DownloadItem[]> {
  if (!items.length || items.length > MAX_HANDOFF_ITEMS)
    throw new Error('BATCH_TOO_LARGE');
  const sources = new Map<string, Promise<SearchResult>>();
  for (const item of items) {
    const key = JSON.stringify([item.source, item.sourceId]);
    if (!sources.has(key))
      sources.set(
        key,
        (async () => {
          const query = new URLSearchParams({
            source: item.source,
            id: item.sourceId,
            handoff: '1',
          });
          const response = await fetch(`/api/detail?${query}`, {
            cache: 'no-store',
            signal,
          });
          if (!response.ok) throw new Error('SOURCE_UNAVAILABLE');
          const detail = await response.json();
          if (
            detail.source !== item.source ||
            String(detail.id) !== item.sourceId ||
            !Array.isArray(detail.episodes)
          )
            throw new Error('SOURCE_UNAVAILABLE');
          return detail;
        })()
      );
  }
  return Promise.all(
    items.map(async (item) => {
      const lookup = sources.get(JSON.stringify([item.source, item.sourceId]));
      if (!lookup) throw new Error('SOURCE_UNAVAILABLE');
      const detail = await lookup;
      const url = detail.episodes[item.episode - 1];
      if (typeof url !== 'string') throw new Error('SOURCE_UNAVAILABLE');
      return { ...item, url };
    })
  );
}
