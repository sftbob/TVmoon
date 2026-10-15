'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent } from 'react';

export default function QuickSearch() {
  const router = useRouter();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };
  return (
    <form action='/search' className='tv-quick-search' onSubmit={handleSubmit}>
      <Search size={15} aria-hidden='true' />
      <input
        name='q'
        aria-label='快速搜尋電影或影集'
        placeholder='尋找一部好作品…'
      />
      <kbd aria-hidden='true'>↵</kbd>
    </form>
  );
}
