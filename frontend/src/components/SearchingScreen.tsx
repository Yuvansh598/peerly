import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const TIPS = [
  "Be respectful to others.",
  "Press Esc anytime to leave.",
  "Adding interests improves matching.",
  "A smile goes a long way!",
  "Make sure you're in a well-lit area."
];

export const SearchingScreen = ({ onCancel }: { onCancel: () => void }) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 4000);
    const timeInterval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => {
      clearInterval(tipInterval);
      clearInterval(timeInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0F1015] text-white p-6">
      <div className="relative mb-8">
        <div className="absolute inset-0 rounded-full bg-[var(--color-accent)] blur-xl opacity-20 animate-pulse"></div>
        <Loader2 className="w-16 h-16 animate-spin text-[var(--color-accent)] relative z-10" />
      </div>
      
      <h2 className="text-2xl font-bold mb-2">Looking for someone...</h2>
      <div className="text-[var(--color-text-secondary)] font-mono mb-8">
        Wait time: {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center mb-8 backdrop-blur-sm transition-all duration-500">
        <div className="text-sm text-[var(--color-text-secondary)] mb-2 uppercase tracking-wider font-bold">Tip</div>
        <div className="text-[var(--color-text-primary)] min-h-[3rem] flex items-center justify-center transition-opacity duration-300">
          {TIPS[tipIndex]}
        </div>
      </div>

      <button 
        onClick={onCancel}
        className="px-8 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 hover:border-white/40 transition-all font-medium"
      >
        Cancel Search
      </button>
    </div>
  );
};
