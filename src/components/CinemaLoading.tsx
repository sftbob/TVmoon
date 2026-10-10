import { Film } from 'lucide-react';

interface CinemaLoadingProps {
  message: string;
  stage?: 'searching' | 'fetching' | 'preferring' | 'ready';
  compact?: boolean;
}

export default function CinemaLoading({
  message,
  stage,
  compact = false,
}: CinemaLoadingProps) {
  const activeStep = stage === 'ready' ? 2 : stage === 'preferring' ? 1 : 0;
  return (
    <div
      className={`tv-loading${compact ? ' tv-loading-compact' : ''}`}
      role='status'
      aria-live='polite'
    >
      <div className='tv-loading-mark' aria-hidden='true'>
        <span className='tv-loading-orbit' />
        <Film size={30} strokeWidth={1.25} />
        <span className='tv-loading-dot' />
      </div>
      <p className='tv-loading-brand' aria-hidden='true'>
        TIANDING CINEMA
      </p>
      <h2>{message}</h2>
      <p className='tv-loading-caption'>好故事，即將上映。</p>
      {stage && (
        <ol className='tv-loading-steps' aria-label='播放準備階段'>
          {['尋找片源', '選擇來源', '準備放映'].map((label, index) => (
            <li
              key={label}
              aria-current={index === activeStep ? 'step' : undefined}
              data-complete={index < activeStep}
            >
              <span aria-hidden='true'>
                {String(index + 1).padStart(2, '0')}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
