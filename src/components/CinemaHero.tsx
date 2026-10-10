'use client';

import { ArrowUpRight, Film, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { DoubanItem } from '@/lib/types';
import { getImageProxyFallbackUrl, getInitialPosterUrl } from '@/lib/utils';

function HeroPoster({ movie, index }: { movie: DoubanItem; index: number }) {
  const [fallback, setFallback] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const src = fallback
    ? getImageProxyFallbackUrl(movie.poster)
    : getInitialPosterUrl(movie.poster);
  return (
    <div className={'tv-hero-poster tv-hero-poster-' + index}>
      {!unavailable && src ? (
        <Image
          src={src}
          alt={movie.title}
          fill
          sizes='(max-width: 767px) 32vw, 210px'
          priority={index === 0}
          referrerPolicy='no-referrer'
          onError={() => {
            if (src !== getImageProxyFallbackUrl(movie.poster))
              setFallback(true);
            else setUnavailable(true);
          }}
        />
      ) : (
        <Film size={40} aria-hidden='true' />
      )}
    </div>
  );
}

export default function CinemaHero({ movies }: { movies: DoubanItem[] }) {
  const featured = movies[0];
  return (
    <section className='tv-hero' aria-label='添丁電影院精選'>
      <div className='tv-hero-copy'>
        <p className='tv-eyebrow'>
          <span /> TIANDING CINEMA · 私人放映室
        </p>
        <h1>
          把時間，
          <br />
          留給好故事。
        </h1>
        <p className='tv-hero-description'>
          從熟悉的經典，到偶然遇見的驚喜。
          <br className='hidden sm:block' />
          選一部喜歡的作品，讓今天慢下來。
        </p>
        <div className='tv-hero-actions'>
          <Link href='/search' className='tv-button-primary'>
            <Search size={17} aria-hidden='true' />
            尋找想看的作品
            <ArrowUpRight size={17} aria-hidden='true' />
          </Link>
          <Link href='/douban?type=movie' className='tv-button-text'>
            瀏覽電影片單 <span aria-hidden='true'>↗</span>
          </Link>
        </div>
        <p className='tv-hero-footnote'>電影 · 影集 · 綜藝 / 你的觀影日常</p>
      </div>
      <div className='tv-hero-gallery'>
        <div className='tv-hero-orbit' aria-hidden='true' />
        {movies.slice(0, 3).map((movie, index) => (
          <HeroPoster
            movie={movie}
            index={index}
            key={movie.id + movie.poster}
          />
        ))}
        {!movies.length && (
          <div className='tv-hero-empty' aria-hidden='true'>
            <Film size={72} strokeWidth={0.7} />
            <span>好故事，值得等待。</span>
          </div>
        )}
        {featured && (
          <Link
            className='tv-featured-label'
            href={
              '/play?title=' +
              encodeURIComponent(featured.title) +
              '&year=' +
              encodeURIComponent(featured.year || '') +
              '&stype=movie'
            }
          >
            <span>
              片單一瞥 {featured.rate ? ' · 豆瓣 ' + featured.rate : ''}
            </span>
            <strong>{featured.title}</strong>
            <ArrowUpRight size={20} aria-hidden='true' />
          </Link>
        )}
      </div>
    </section>
  );
}
