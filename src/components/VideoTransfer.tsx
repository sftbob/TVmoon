'use client';

import { Copy, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { SearchResult } from '@/lib/types';
import { getVideoTransferInfo } from '@/lib/video-transfer';

import DownloadQueue from './DownloadQueue';

export default function VideoTransfer({ url, detail }: { url: string; detail?: SearchResult | null }) {
  const info = getVideoTransferInfo(url);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const currentUrl = useRef(url);
  useEffect(() => {
    currentUrl.current = url;
    setCopied(false);
    setManualCopy(false);
  }, [url]);

  if (!info) return detail ? <DownloadQueue detail={detail} /> : null;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(info.url);
      if (currentUrl.current !== url) return;
      setCopied(true);
      setManualCopy(false);
    } catch {
      if (currentUrl.current !== url) return;
      setManualCopy(true);
    }
  };

  return (
    <section
      aria-label="影片下載"
      className="mt-3 rounded-xl border border-gray-200 bg-white/70 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/70"
    >
      <div className="flex flex-wrap gap-2">
        {info.isFile && (
          <a
            href={info.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            下載／開啟影片檔
          </a>
        )}
        <button
          type="button"
          onClick={copyUrl}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100"
        >
          <Copy className="h-4 w-4" />
          複製播放網址
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {info.isFile
          ? '另開影片檔後，可使用瀏覽器另存；是否直接下載取決於來源。'
          : '此來源為串流或未知格式，可複製網址至支援的下載工具。'}
      </p>
      {copied && (
        <p role="status" className="mt-2 text-green-700 dark:text-green-400">
          播放網址已複製
        </p>
      )}
      {manualCopy && (
        <div className="mt-2">
          <p role="status" className="mb-1 text-gray-600 dark:text-gray-300">
            無法自動複製，請選取下方網址複製。
          </p>
          <input
            aria-label="播放網址"
            readOnly
            value={info.url}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-gray-300 bg-white p-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      )}
      {detail && <DownloadQueue detail={detail} />}
    </section>
  );
}
