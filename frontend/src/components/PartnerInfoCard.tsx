import { useEffect, useState } from 'react';
import { User as UserIcon, Globe, Heart } from 'lucide-react';

type PartnerInfoProps = {
  partnerUsername: string | null;
  tags?: string[];
  connectionState: string;
};

export const PartnerInfoCard = ({ partnerUsername, tags = [], connectionState }: PartnerInfoProps) => {
  const [visible, setVisible] = useState(true);

  // Auto-hide after 5 seconds if connected
  useEffect(() => {
    if (connectionState === 'connected') {
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    } else {
      setVisible(true);
    }
  }, [connectionState]);

  if (!visible && connectionState === 'connected') return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col items-center animate-in fade-in zoom-in duration-300 z-30 max-w-sm w-full shadow-2xl">
      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 p-[2px] mb-4">
        <div className="w-full h-full rounded-full bg-[#1a1b1e] flex items-center justify-center overflow-hidden">
          <UserIcon size={40} className="text-white/50" />
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-white mb-1">
        {partnerUsername ? `@${partnerUsername}` : 'Stranger'}
      </h3>
      
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] text-sm mb-4">
        <Globe size={14} /> Unknown Location
      </div>

      {tags && tags.length > 0 && (
        <div className="w-full">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] mb-2 font-medium">
            <Heart size={14} className="text-pink-500" /> Shared Interests
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {tags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-sm font-medium text-cyan-400 animate-pulse uppercase tracking-widest">
        {connectionState === 'connected' ? 'Connected' : 'Connecting...'}
      </div>
    </div>
  );
};
