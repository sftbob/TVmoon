/* eslint-disable no-control-regex -- Contract explicitly rejects control characters. */
import { DownloadItem } from './download-queue';
import { BatchRequest, makeBatch, prepareTvmoonItems } from './tvmoon-handoff';

export function validMediaUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    Array.from(value).length > 8192 ||
    /[\s\x00-\x1f\x7f]/.test(value)
  )
    return false;
  try {
    const parsed = new URL(value);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
export async function prepareRequest(
  items: DownloadItem[]
): Promise<BatchRequest> {
  if (!items.length || items.length > 50) throw new Error('BATCH_TOO_LARGE');
  for (const item of items) {
    if (
      !item.title.trim() ||
      Array.from(item.title).length > 200 ||
      /[\x00-\x1f\x7f]|https?:\/\//i.test(item.title) ||
      !Number.isInteger(item.episode) ||
      item.episode < 1 ||
      item.episode > 100000
    )
      throw new Error('INVALID_ITEM');
    if (!validMediaUrl(item.url)) throw new Error('INVALID_URL');
  }
  const mapped = await prepareTvmoonItems(items);
  const request = makeBatch(mapped, true);
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 900000)
    throw new Error('MESSAGE_TOO_LARGE');
  request.items.forEach(Object.freeze);
  Object.freeze(request.items);
  return Object.freeze(request);
}
export interface ItemResult {
  index: number;
  clientItemId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  code: string;
}
export interface BatchReply {
  ok: boolean;
  stage:
    | 'extension_received'
    | 'desktop_queued'
    | 'execution_started'
    | 'rejected';
  code: string;
  accepted: number;
  duplicates: number;
  rejected: number;
  results: ItemResult[];
  execution: 'started' | 'already_running' | 'not_started';
  replayed: boolean;
}
export function readBatchReply(
  raw: unknown,
  request: BatchRequest
): BatchReply {
  const value = raw as Record<string, unknown>;
  if (
    !value ||
    value.version !== 1 ||
    value.requestId !== request.requestId ||
    typeof value.ok !== 'boolean' ||
    typeof value.code !== 'string' ||
    !/^[A-Z_]+$/.test(value.code) ||
    ![
      'extension_received',
      'desktop_queued',
      'execution_started',
      'rejected',
    ].includes(String(value.stage))
  )
    throw new Error('INVALID_REPLY');
  if (value.stage === 'rejected' && value.accepted === undefined)
    return {
      ok: false,
      stage: 'rejected',
      code: value.code,
      accepted: 0,
      duplicates: 0,
      rejected: request.items.length,
      results: [],
      execution: 'not_started',
      replayed: false,
    };
  const counts = [value.accepted, value.duplicates, value.rejected];
  if (
    !counts.every((n) => Number.isInteger(n) && Number(n) >= 0) ||
    counts.reduce<number>((n, v) => n + Number(v), 0) !==
      request.items.length ||
    !Array.isArray(value.results) ||
    !['started', 'already_running', 'not_started'].includes(
      String(value.execution)
    ) ||
    typeof value.replayed !== 'boolean'
  )
    throw new Error('INVALID_REPLY');
  if (
    value.ok !== Number(value.accepted) + Number(value.duplicates) > 0 ||
    (value.stage === 'execution_started' &&
      !['started', 'already_running'].includes(String(value.execution))) ||
    (value.stage === 'desktop_queued' && value.execution !== 'not_started') ||
    (value.stage === 'rejected' && value.ok)
  )
    throw new Error('INVALID_REPLY');
  const results: ItemResult[] = [];
  const seen = new Set<number>();
  for (const row of value.results) {
    if (
      !row ||
      !Number.isInteger(row.index) ||
      row.index < 0 ||
      row.index >= request.items.length ||
      seen.has(row.index) ||
      !['accepted', 'duplicate', 'rejected'].includes(row.status) ||
      typeof row.code !== 'string' ||
      !/^[A-Z_]+$/.test(row.code) ||
      typeof row.clientItemId !== 'string' ||
      (row.status !== 'rejected' && !row.clientItemId) ||
      (row.clientItemId !== '' &&
        row.clientItemId !== request.items[row.index].clientItemId)
    )
      throw new Error('INVALID_REPLY');
    seen.add(row.index);
    results.push({
      index: row.index,
      clientItemId: row.clientItemId,
      status: row.status,
      code: row.code,
    });
  }
  if (
    results.length &&
    (results.length !== request.items.length ||
      ['accepted', 'duplicate', 'rejected'].some(
        (s, i) =>
          results.filter((r) => r.status === s).length !== Number(counts[i])
      ))
  )
    throw new Error('INVALID_REPLY');
  if (
    !results.length &&
    (value.stage !== 'rejected' ||
      value.accepted !== 0 ||
      value.duplicates !== 0)
  )
    throw new Error('INVALID_REPLY');
  return {
    ok: value.ok,
    stage: value.stage as BatchReply['stage'],
    code: value.code,
    accepted: Number(value.accepted),
    duplicates: Number(value.duplicates),
    rejected: Number(value.rejected),
    results,
    execution: value.execution as BatchReply['execution'],
    replayed: value.replayed,
  };
}
export const unknownResultCodes = new Set([
  'HANDOFF_TIMEOUT',
  'LAUNCH_TIMEOUT',
  'HOST_ERROR',
  'INVALID_REPLY',
  'BRIDGE_ERROR',
]);
export const inspectDesktopCodes = new Set([
  'REQUEST_ID_CONFLICT',
  'RECEIPT_UNCERTAIN',
]);
export function errorGuidance(code: string): string {
  const messages: Record<string, string> = {
    HANDOFF_TIMEOUT:
      '交接等待逾時，結果未知。先查看添丁清單，可用原請求手動重試；這不會取消下載。',
    LAUNCH_TIMEOUT:
      '桌面啟動等待逾時，結果未知。請查看添丁並用原請求手動重試。',
    HOST_ERROR: '本機交接結果未知。請查看添丁，再用原請求手動重試。',
    INVALID_REPLY: '回覆格式不符合契約，結果未知。請核對添丁清單。',
    REQUEST_ID_CONFLICT:
      '相同請求 ID 的內容發生衝突。請先核對桌面，僅為確定未交接項目建立新請求。',
    RECEIPT_UNCERTAIN:
      '添丁無法確定先前交接結果。請人工核對桌面，不要直接重送整批。',
    ORIGIN_NOT_ALLOWED: '請在插件選項核准下方完整網站 origin，儲存後重新整理。',
    INVALID_ORIGIN: '請使用已核准的完整 HTTPS 網站 origin。',
    USER_GESTURE_REQUIRED: '請在準備完成後，以真實按鈕點擊送出。',
    BRIDGE_BUSY: '上一筆交接尚未結束，請稍後手動操作。',
    UNSUPPORTED_VERSION: '請更新為桌面與插件 2.9.0 相容候選版本（契約 1）。',
    UNSUPPORTED_ACTION: '插件操作不相容，請更新桌面與插件。',
    SETTINGS_REQUIRED: '請在添丁保存有效且可寫入的下載資料夾。',
    DEPENDENCY_MISSING: '請在添丁設定 FFmpeg 與 ffprobe。',
    SETTINGS_ERROR: '添丁設定保存異常，請先在桌面排除。',
    RECEIPT_STORE_ERROR: '添丁去重收據保存異常，請先排除桌面儲存問題。',
    RECEIPT_LIMIT: '添丁未到期收據已達上限，請等待收據到期。',
    QUEUE_FULL: '清單容量已滿，請移除已結束項目後再補送被拒集數。',
    DESKTOP_NOT_READY: '添丁尚未就緒，請確認相容版本與設定。',
    DESKTOP_BUSY: '添丁正在處理單支工作，請完成或取消後再送出。',
    DESKTOP_CLOSING: '添丁正在關閉，請等候結束後再手動操作。',
    BATCH_TOO_LARGE: '每次交接限 1–50 集，請減少勾選；不會自動分批。',
    MESSAGE_TOO_LARGE: '請求資料超過上限，請減少勾選。',
    INVALID_URL: '媒體網址無效，請回播放頁重新取得來源，再建立新請求。',
    INVALID_ITEM: '片名或集數不符合契約，片名不可超過 200 字元或包含網址。',
    INVALID_REQUEST: '交接資料不符合契約，請重新準備。',
    SOURCE_UNAVAILABLE: '無法取得所選來源的集數網址，請回播放頁重新確認來源。',
    HOST_UNAVAILABLE: '請檢查添丁 2.9.0 的瀏覽器整合與 Native Host 安裝。',
    EXTENSION_UNAVAILABLE: '請安裝或重新載入相容插件，核准網站後重新整理。',
    BRIDGE_ERROR: '橋接發生錯誤，結果未知。請核對桌面與插件安裝。',
  };
  return messages[code] || '請依添丁桌面提示處理；此回覆不代表影片下載完成。';
}
