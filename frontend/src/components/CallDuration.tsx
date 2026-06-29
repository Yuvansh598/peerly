import { useState, useEffect } from 'react';

export const CallDuration = ({ startTime }: { startTime: number }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(duration / 60).toString().padStart(2, '0');
  const secs = (duration % 60).toString().padStart(2, '0');

  return (
    <div className="font-mono text-sm tracking-wider font-medium drop-shadow-md">
      {mins}:{secs}
    </div>
  );
};

export const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
