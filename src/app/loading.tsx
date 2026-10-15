import CinemaLoading from '@/components/CinemaLoading';

export default function Loading() {
  return (
    <div
      className='tv-shell flex min-h-screen items-center justify-center'
      aria-busy='true'
    >
      <CinemaLoading message='正在開啟頁面…' compact />
    </div>
  );
}
