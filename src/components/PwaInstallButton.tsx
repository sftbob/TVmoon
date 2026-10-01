'use client';

import { Smartphone } from 'lucide-react';
import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallContext = createContext<{
  prompt: InstallPrompt | null;
  installed: boolean;
  setPrompt: Dispatch<SetStateAction<InstallPrompt | null>>;
  setInstalled: Dispatch<SetStateAction<boolean>>;
} | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <InstallContext.Provider
      value={{ prompt, installed, setPrompt, setInstalled }}
    >
      {children}
    </InstallContext.Provider>
  );
}

export default function PwaInstallButton() {
  const context = useContext(InstallContext);
  const guide = useRef<HTMLDialogElement>(null);
  if (!context) return null;
  const { prompt, installed, setPrompt, setInstalled } = context;

  const install = async () => {
    if (!prompt) {
      guide.current?.showModal();
      return;
    }
    setPrompt(null);
    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
    } catch {
      guide.current?.showModal();
    }
  };

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={install}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Smartphone className="h-4 w-4 text-gray-500" />
        安裝 App
      </button>
      <dialog
        ref={guide}
        aria-labelledby="pwa-install-title"
        className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-black/50 dark:bg-gray-900 dark:text-gray-100"
      >
        <h2 id="pwa-install-title" className="text-lg font-semibold">
          安裝到主畫面
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          iPhone／iPad：使用 Safari 開啟本站，點「分享」→「加入主畫面」。
        </p>
        <p className="mt-3 text-sm leading-relaxed">
          Android／電腦：使用 Chrome 或
          Edge，在瀏覽器選單選「安裝應用程式」或「加入主畫面」。
        </p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          安裝後可由 App 圖示開啟。搜尋與串流播放仍需網路連線。
        </p>
        <form method="dialog" className="mt-4">
          <button className="min-h-11 w-full rounded-lg bg-green-600 px-4 py-2 text-white">
            知道了
          </button>
        </form>
      </dialog>
    </>
  );
}
