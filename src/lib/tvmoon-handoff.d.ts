// Types for the unchanged helper supplied at Tianding commit bd5e7e6.
export interface HandoffItem {
  clientItemId: string;
  title: string;
  episode: number;
  mediaUrl: string;
  sourcePageUrl?: string;
}
export interface BatchRequest {
  version: 1;
  requestId: string;
  action: 'enqueueBatch';
  startAfterEnqueue: boolean;
  items: HandoffItem[];
}
export function probeExtension(): Promise<unknown>;
export function prepareTvmoonItems(
  items: { id: string; title: string; episode: number; url: string }[],
  sourcePageUrl?: string
): Promise<HandoffItem[]>;
export function makeBatch(
  items: HandoffItem[],
  startAfterEnqueue?: boolean
): BatchRequest;
export function sendBatch(request: BatchRequest): Promise<unknown>;
