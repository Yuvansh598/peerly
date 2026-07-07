import React from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

interface AvatarProps {
  username?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  speaking?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ username = '?', src, size = 'md', speaking = false }) => {
  const firstLetter = username.charAt(0).toUpperCase();

  return (
    <div className="relative inline-block select-none">
      {speaking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border-2 border-[#00f0ff]"
          />
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.5, delay: 0.5, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border border-[#00f0ff]"
          />
        </div>
      )}

      <div
        className={clsx(
          "rounded-full flex items-center justify-center overflow-hidden font-bold text-white transition-all duration-300 relative z-10 border bg-gradient-to-tr from-[#0072ff] to-[#9d4edd]",
          {
            "w-10 h-10 text-sm border-white/10": size === 'sm',
            "w-16 h-16 text-xl border-white/15": size === 'md',
            "w-24 h-24 text-3xl border-white/20": size === 'lg',
            "w-36 h-36 text-5xl border-white/20": size === 'xl',
            "ring-4 ring-[#00f0ff] ring-offset-4 ring-offset-[#070913]": speaking
          }
        )}
      >
        {src ? (
          <img src={src} alt={username} className="w-full h-full object-cover" />
        ) : (
          <span>{firstLetter}</span>
        )}
      </div>
    </div>
  );
};
