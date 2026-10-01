'use client';

import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import {
  DownloadItem,
  makeDownloadJob,
  MAX_DOWNLOAD_ITEMS,
  mergeDownloadItems,
  readDownloadItems,
} from '@/lib/download-queue';
import { SearchResult } from '@/lib/types';

const buttonClass =
  'min-h-11 rounded-lg bg-gray-100 px-3 py-2 text-gray-800 dark:bg-gray-800 dark:text-gray-100';

export default function DownloadQueue({ detail }: { detail: SearchResult }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [episodes, setEpisodes] = useState<number[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [parallel, setParallel] = useState(2);
  const [fragments, setFragments] = useState(4);
  const [storageKey, setStorageKey] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const key = `tvmoon-downloads:${
      getAuthInfoFromBrowserCookie()?.username || 'owner'
    }`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      const restored = readDownloadItems(saved.items);
      setItems(restored);
      setChecked(restored.map((item) => item.id));
      const settings = makeDownloadJob([], saved.parallel, saved.fragments);
      setParallel(settings.parallel);
      setFragments(settings.fragments);
    } catch {
      setMessage('無法讀取已存清單，仍可建立新任務。');
    }
    setStorageKey(key);
  }, []);
  useEffect(() => {
    setEpisodes([]);
  }, [detail.source, detail.id]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(makeDownloadJob(items, parallel, fragments))
      );
    } catch {
      setMessage('瀏覽器無法保存清單；離開前請匯出任務。');
    }
  }, [items, parallel, fragments, storageKey]);

  const add = () => {
    const incoming = readDownloadItems(
      episodes.map((index) => ({
        id: JSON.stringify([detail.source, detail.id, index]),
        title: detail.title.slice(0, 200),
        episode: index + 1,
        url: detail.episodes[index],
      }))
    );
    const next = mergeDownloadItems(items, incoming);
    setItems(next);
    setChecked(
      Array.from(new Set([...checked, ...incoming.map((item) => item.id)])).filter(
        (id) => next.some((item) => item.id === id)
      )
    );
    setMessage(
      `清單共 ${next.length} 集；最多 ${MAX_DOWNLOAD_ITEMS} 集。相同來源與集數會更新網址。`
    );
  };
  const exportJob = () => {
    const job = makeDownloadJob(
      items.filter((item) => checked.includes(item.id)),
      parallel,
      fragments
    );
    const blob = new Blob([JSON.stringify(job, null, 2)], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `tvmoon-queue-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setMessage(
      `已匯出 ${job.items.length} 集。請開啟 Windows 下載助手並選擇此任務檔；網站尚未開始下載。`
    );
  };

  return (
    <details className="mt-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <summary className="cursor-pointer font-medium">
        批量下載與待下載清單（{items.length}）
      </summary>
      <p className="my-2 text-xs text-gray-500">
        勾選集數 → 加入清單 → 匯出任務 → Windows
        助手自動完成。清單保存在此瀏覽器，下載進度請看電腦助手。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            setEpisodes(
              detail.episodes.map((_, i) => i).slice(0, MAX_DOWNLOAD_ITEMS)
            )
          }
        >
          全選集數
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setEpisodes([])}
        >
          取消集數勾選
        </button>
      </div>
      <div className="my-2 flex max-h-40 flex-wrap gap-2 overflow-auto">
        {detail.episodes.slice(0, MAX_DOWNLOAD_ITEMS).map((_, index) => (
          <label
            key={index}
            className="flex min-h-11 items-center gap-2 rounded border px-3"
          >
            <input
              type="checkbox"
              checked={episodes.includes(index)}
              onChange={(event) =>
                setEpisodes(
                  event.target.checked
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
        disabled={!episodes.length || !storageKey}
        className={`${buttonClass} disabled:opacity-40`}
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
              onClick={() => setChecked(items.map((item) => item.id))}
            >
              全選清單
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setChecked([])}
            >
              取消清單勾選
            </button>
            <button
              type="button"
              disabled={!checked.length}
              className={`${buttonClass} disabled:opacity-40`}
              onClick={() => {
                setItems(items.filter((item) => !checked.includes(item.id)));
                setChecked([]);
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
                    checked={checked.includes(item.id)}
                    onChange={(event) =>
                      setChecked(
                        event.target.checked
                          ? [...checked, item.id]
                          : checked.filter((id) => id !== item.id)
                      )
                    }
                  />
                  {item.title} · 第 {item.episode} 集
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="my-3 flex flex-wrap gap-3">
        <label>
          同時下載{' '}
          <select
            aria-label="同時下載數"
            value={parallel}
            onChange={(e) => setParallel(Number(e.target.value))}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} 部
              </option>
            ))}
          </select>
        </label>
        <label>
          每部連線{' '}
          <select
            aria-label="每部連線數"
            value={fragments}
            onChange={(e) => setFragments(Number(e.target.value))}
          >
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n} 條
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!checked.length}
          onClick={exportJob}
          className={`${buttonClass} disabled:opacity-40`}
        >
          匯出勾選任務（{checked.length}）
        </button>
        <a
          className={buttonClass}
          href="/download-tools/tvmoon-windows.zip"
          download
        >
          下載 Windows 助手
        </a>
        <a
          className={buttonClass}
          href="/download-tools/README.txt"
          target="_blank"
          rel="noopener noreferrer"
        >
          首次設定說明
        </a>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        關閉網站不影響電腦下載；助手視窗需保持開啟。來源限速或不支援分段時，多連線不一定加快。網址可能過期，失敗時回到播放頁重新加入該集。
      </p>
      {message && (
        <p role="status" className="mt-2">
          {message}
        </p>
      )}
    </details>
  );
}
