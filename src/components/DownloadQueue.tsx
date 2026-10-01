'use client';

import { useEffect, useRef, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import {
  MAX_HANDOFF_ITEMS,
  mergeQueueMetadata,
  metadataFromDetail,
  QueueMetadata,
  readQueueMetadata,
  resolveDownloadItems,
} from '@/lib/download-queue';
import {
  BatchReply,
  errorGuidance,
  inspectDesktopCodes,
  prepareRequest,
  readBatchReply,
  unknownResultCodes,
} from '@/lib/tianding-contract';
import { BatchRequest, probeExtension, sendBatch } from '@/lib/tvmoon-handoff';
import { SearchResult } from '@/lib/types';

const buttonClass =
  'min-h-11 rounded-lg bg-gray-100 px-3 py-2 text-gray-800 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-100';
interface Prepared {
  request: BatchRequest;
  snapshot: QueueMetadata[];
  stamp: string;
}
interface Session {
  prepared: Prepared;
  reply?: BatchReply;
  code?: string;
  waiting?: boolean;
}

export default function DownloadQueue({ detail }: { detail: SearchResult }) {
  const [items, setItems] = useState<QueueMetadata[]>([]);
  const [episodes, setEpisodes] = useState<number[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [storageKey, setStorageKey] = useState('');
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState('');
  const [extension, setExtension] = useState<
    'unknown' | 'checking' | 'available' | 'unavailable' | 'incompatible'
  >('unknown');
  const [extensionMessage, setExtensionMessage] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [verifiedDesktop, setVerifiedDesktop] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const probeSequence = useRef(0);
  const selected = items.filter((item) => checked.includes(item.id));
  const stamp = JSON.stringify(selected);
  const uncertain =
    !!session?.code &&
    (unknownResultCodes.has(session.code) ||
      inspectDesktopCodes.has(session.code));
  const locked = !!session?.waiting || uncertain;

  const probe = () => {
    const sequence = ++probeSequence.current;
    setExtension('checking');
    setExtensionMessage('正在查詢插件…');
    probeExtension()
      .then((raw) => {
        if (!mounted.current || sequence !== probeSequence.current) return;
        const reply = raw as Record<string, unknown>;
        if (
          reply?.code === 'AVAILABLE' &&
          reply.ok === true &&
          reply.contractVersion === 1 &&
          reply.extensionVersion === '2.9.0' &&
          reply.maxItems === 50
        ) {
          setExtension('available');
          setExtensionMessage('插件可用；桌面、下載設定與相依工具尚未驗證。');
        } else if (
          reply?.code === 'UNSUPPORTED_VERSION' ||
          reply?.code === 'AVAILABLE'
        ) {
          setExtension('incompatible');
          setExtensionMessage(errorGuidance('UNSUPPORTED_VERSION'));
        } else {
          setExtension('unavailable');
          setExtensionMessage(
            errorGuidance(
              typeof reply?.code === 'string'
                ? reply.code
                : 'EXTENSION_UNAVAILABLE'
            )
          );
        }
      })
      .catch(() => {
        if (!mounted.current || sequence !== probeSequence.current) return;
        setExtension('unavailable');
        setExtensionMessage(
          '插件未回覆：可能未安裝、網站未核准、權限已撤銷，或更新後尚未重新整理。'
        );
      });
  };
  useEffect(() => {
    mounted.current = true;
    setOrigin(location.origin);
    const key = `tvmoon-downloads:${
      getAuthInfoFromBrowserCookie()?.username || 'owner'
    }`;
    try {
      // Scrub all legacy account queues before writing any new metadata.
      const keys = Array.from({ length: localStorage.length }, (_, i) =>
        localStorage.key(i)
      ).filter((k): k is string => !!k && k.startsWith('tvmoon-downloads:'));
      for (const oldKey of keys) {
        let metadata: QueueMetadata[] = [];
        try {
          metadata = readQueueMetadata(
            JSON.parse(localStorage.getItem(oldKey) || '{}').items
          );
        } catch {
          /* corrupt legacy data */
        }
        localStorage.setItem(
          oldKey,
          JSON.stringify({ version: 2, items: metadata })
        );
      }
      const restored = readQueueMetadata(
        JSON.parse(localStorage.getItem(key) || '{}').items
      );
      setItems(restored);
      setChecked(restored.map((item) => item.id));
    } catch {
      setMessage(
        '無法讀寫瀏覽器清單；請清除此站舊下載清單資料。網址只保留於記憶體。'
      );
    }
    setStorageKey(key);
    probe();
    return () => {
      mounted.current = false;
    };
    // Initial probe never submits downloads; repeated checks are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setEpisodes([]);
  }, [detail.source, detail.id]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 2, items: readQueueMetadata(items) })
      );
    } catch {
      setMessage('清單無法保存；請保持此頁開啟。媒體網址不會保存。');
    }
  }, [items, storageKey]);

  useEffect(() => {
    setPrepared(null);
    setPreparing(false);
    if (locked || !selected.length || selected.length > MAX_HANDOFF_ITEMS)
      return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    setPreparing(true);
    resolveDownloadItems(selected, controller.signal)
      .then(prepareRequest)
      .then((request) => {
        if (current) {
          setPrepared({ request, snapshot: selected, stamp });
          setMessage('網址已準備，可交給添丁；下載來源以清單標示為準。');
        }
      })
      .catch((error) => {
        if (current)
          setMessage(
            errorGuidance(
              error instanceof Error &&
                ['INVALID_ITEM', 'INVALID_URL', 'MESSAGE_TOO_LARGE'].includes(
                  error.message
                )
                ? error.message
                : 'SOURCE_UNAVAILABLE'
            )
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (current) setPreparing(false);
      });
    return () => {
      current = false;
      controller.abort();
      clearTimeout(timer);
    };
    // stamp captures complete selected metadata; URLs are always freshly fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, refresh, locked]);

  const changeSelection = (next: string[]) => {
    setSession(null);
    setVerifiedDesktop(false);
    setChecked(next);
  };
  const add = () => {
    try {
      const incoming = metadataFromDetail(detail, episodes);
      const next = mergeQueueMetadata(items, incoming);
      setItems(next);
      setRefresh((n) => n + 1);
      changeSelection(
        Array.from(new Set([...checked, ...incoming.map((item) => item.id)]))
      );
    } catch (error) {
      setMessage(
        errorGuidance(error instanceof Error ? error.message : 'INVALID_ITEM')
      );
    }
  };
  const send = (ready: Prepared) => {
    if (busy.current) return;
    busy.current = true;
    // Immediately called in the real click, before any fetch or await.
    const pending = sendBatch(ready.request);
    setSession({ prepared: ready, waiting: true });
    setVerifiedDesktop(false);
    pending
      .then((raw) => {
        const reply = readBatchReply(raw, ready.request);
        if (mounted.current)
          setSession({ prepared: ready, reply, code: reply.code });
      })
      .catch((error) => {
        if (mounted.current)
          setSession({
            prepared: ready,
            code:
              error instanceof Error && error.message === 'HANDOFF_TIMEOUT'
                ? 'HANDOFF_TIMEOUT'
                : 'INVALID_REPLY',
          });
      })
      .finally(() => {
        busy.current = false;
      });
  };
  const rejectedIds = session?.reply
    ? session.reply.results.length
      ? session.reply.results
          .filter((row) => row.status === 'rejected')
          .map((row) => session.prepared.snapshot[row.index].id)
      : session.prepared.snapshot.map((item) => item.id)
    : [];
  const retryable = !!session?.code && unknownResultCodes.has(session.code);
  const canSend =
    !!prepared &&
    prepared.stamp === stamp &&
    extension === 'available' &&
    !preparing &&
    !session &&
    !locked;
  const summary =
    session?.reply?.execution === 'already_running'
      ? '已追加至正在執行的添丁清單。'
      : session?.reply?.stage === 'execution_started'
      ? '已交接並開始清單，請到添丁影像館查看進度。'
      : session?.reply?.stage === 'desktop_queued'
      ? '已加入添丁清單，請到桌面程式開始下載。'
      : session?.reply?.stage === 'extension_received'
      ? '插件已收到請求；尚未確認桌面入列。'
      : '';

  return (
    <details
      open
      className="mt-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
    >
      <summary className="cursor-pointer font-medium">
        交給添丁下載 · 待下載清單（{items.length}）
      </summary>
      <p className="my-2 text-xs text-gray-500">
        勾選集數 → 加入清單 → 等待網址準備 → 交給添丁下載。每次最多 50
        集；進度與取消操作請到添丁桌面。換源不會改動已加入的任務。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={locked || detail.episodes.length > 50}
          onClick={() => setEpisodes(detail.episodes.map((_, i) => i))}
        >
          全選集數
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={locked}
          onClick={() => setEpisodes([])}
        >
          取消集數勾選
        </button>
      </div>
      {detail.episodes.length > 50 && (
        <p className="my-2">
          超過 50 集，請分別勾選與點擊交接，每次最多 50 集。
        </p>
      )}
      <div className="my-2 flex max-h-40 flex-wrap gap-2 overflow-auto">
        {detail.episodes.map((_, index) => (
          <label
            key={index}
            className="flex min-h-11 items-center gap-2 rounded border px-3"
          >
            <input
              type="checkbox"
              disabled={
                locked || (!episodes.includes(index) && episodes.length >= 50)
              }
              checked={episodes.includes(index)}
              onChange={(e) =>
                setEpisodes(
                  e.target.checked
                    ? [...episodes, index]
                    : episodes.filter((i) => i !== index)
                )
              }
            />
            第 {index + 1} 集
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!episodes.length || !storageKey || locked}
        className={buttonClass}
        onClick={add}
      >
        加入待下載清單
      </button>
      {!!items.length && (
        <>
          <div className="my-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => changeSelection(items.map((item) => item.id))}
            >
              全選清單
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={locked}
              onClick={() => changeSelection([])}
            >
              取消清單勾選
            </button>
            <button
              type="button"
              disabled={!checked.length || locked}
              className={buttonClass}
              onClick={() => {
                setItems(items.filter((item) => !checked.includes(item.id)));
                changeSelection([]);
              }}
            >
              移除勾選
            </button>
          </div>
          <ul className="max-h-48 overflow-auto">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={checked.includes(item.id)}
                    onChange={(e) =>
                      changeSelection(
                        e.target.checked
                          ? [...checked, item.id]
                          : checked.filter((id) => id !== item.id)
                      )
                    }
                  />
                  {item.title} · 第 {item.episode} 集 · {item.sourceName}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {selected.length > 50 && (
        <p role="alert">{errorGuidance('BATCH_TOO_LARGE')}</p>
      )}
      <p role="status" className="my-2">
        {extensionMessage}
      </p>
      <div className="my-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={extension === 'checking' || !!session?.waiting}
          onClick={probe}
        >
          查詢插件
        </button>
        <button
          type="button"
          className={`${buttonClass} bg-green-600 text-white`}
          disabled={!canSend}
          onClick={() => {
            if (prepared && canSend) send(prepared);
          }}
        >
          交給添丁下載（{selected.length}）
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={locked || !selected.length || selected.length > 50}
          onClick={() => {
            setSession(null);
            setRefresh((n) => n + 1);
          }}
        >
          重新取得網址／建立新請求
        </button>
      </div>
      {preparing && <p role="status">正在取得所選來源的實際網址並準備請求…</p>}
      {message && <p role="status">{message}</p>}
      {session && (
        <div role="status" className="my-3 rounded border p-3">
          {session.waiting ? (
            <p>
              插件交接中，最多等待 65
              秒。請勿重複點擊；離開頁面不會取消桌面下載。
            </p>
          ) : (
            <>
              {summary && <p>{summary}</p>}
              {session.reply && (
                <p>
                  接受 {session.reply.accepted} · 重複{' '}
                  {session.reply.duplicates} · 拒絕 {session.reply.rejected}
                </p>
              )}
              {session.reply?.replayed && (
                <p>此請求已處理，顯示原交接結果，並非即時下載進度。</p>
              )}
              {session.code && !['OK', 'PARTIAL'].includes(session.code) && (
                <p>
                  {session.code}：{errorGuidance(session.code)}
                </p>
              )}
              {session.reply?.results
                .filter((row) => row.status === 'rejected')
                .map((row) => (
                  <p key={row.index}>
                    {session.prepared.snapshot[row.index].title} · 第{' '}
                    {session.prepared.snapshot[row.index].episode} 集：
                    {row.code}，{errorGuidance(row.code)}
                  </p>
                ))}
              {retryable && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => send(session.prepared)}
                >
                  用原請求手動重試
                </button>
              )}
              {uncertain && (
                <>
                  <label className="my-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={verifiedDesktop}
                      onChange={(e) => setVerifiedDesktop(e.target.checked)}
                    />
                    我已核對添丁清單，接下來只選擇未交接或需更新的項目
                  </label>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!verifiedDesktop}
                    onClick={() => {
                      setSession(null);
                      changeSelection([]);
                    }}
                  >
                    核對後重新選擇
                  </button>
                </>
              )}
              {!uncertain && !!session.reply?.rejected && (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => changeSelection(rejectedIds)}
                >
                  只勾選被拒集數，重新準備
                </button>
              )}
            </>
          )}
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer">安裝與網站授權說明</summary>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Windows Chrome／Edge 安裝添丁桌面與插件 2.9.0 候選版；桌面
            2.8.0／插件 2.7.0 不相容。
          </li>
          <li>
            在添丁設定更新瀏覽器整合；於瀏覽器擴充功能頁載入／重載插件，再開啟插件選項。
          </li>
          <li>
            逐站核准完整 HTTPS
            origin（不含尾斜線或路徑），儲存後接受權限並重新整理網站。此頁
            origin：<code>{origin}</code>；正式站：
            <code>https://tv-moon-lime.vercel.app</code>。不同預覽 hostname
            須另行核准，不能用 *.vercel.app。
          </li>
          <li>
            添丁保存下載資料夾、畫質、格式與片段並行設定，並確認
            FFmpeg／ffprobe。網站只能提示，不能修改插件授權。
          </li>
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          網址僅在記憶體保留，不匯出或寫入清單。網址過期時回網站重新取得，以新請求送出；逾時重試必須保持原請求。僅處理有權保存的公開媒體。PWA
          仍待實測，手機不支援控制 Windows。
        </p>
      </details>
    </details>
  );
}
