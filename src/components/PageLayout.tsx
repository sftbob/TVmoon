import { Search } from 'lucide-react';

import { BackButton } from './BackButton';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import Sidebar from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}
const PageLayout = ({ children, activePath = '/' }: PageLayoutProps) => {
  const label =
    activePath === '/play'
      ? '正在放映'
      : activePath === '/search'
      ? '探索好故事'
      : activePath.startsWith('/douban')
      ? '精選片單'
      : '我的放映室';
  return (
    <div className='tv-shell w-full min-h-screen'>
      <MobileHeader showBackButton={activePath === '/play'} />
      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen'>
        <div className='hidden md:block'>
          <Sidebar activePath={activePath} />
        </div>
        <div className='relative min-w-0 flex-1'>
          <header className='tv-topbar hidden md:flex'>
            <div className='flex items-center gap-3'>
              {activePath === '/play' && <BackButton />}
              <span className='tv-topbar-label'>{label}</span>
            </div>
            <div className='flex items-center gap-3'>
              <form action='/search' className='tv-quick-search'>
                <Search size={15} aria-hidden='true' />
                <input
                  name='q'
                  aria-label='快速搜尋電影或影集'
                  placeholder='尋找一部好作品…'
                />
                <kbd aria-hidden='true'>↵</kbd>
              </form>
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main
            className='flex-1 md:min-h-0 mb-14 md:mb-0'
            style={{
              paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </main>
        </div>
      </div>
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>
    </div>
  );
};
export default PageLayout;
