import React from 'react';
import { motion } from 'framer-motion';

export const Loader: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 select-none">
      <div className="relative w-16 h-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="absolute inset-0 rounded-full border-4 border-white/5 border-t-[#00f0ff] glass-glow"
        />
        <motion.div
          animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute inset-3 rounded-full bg-[#00f0ff]/20 blur-sm"
        />
      </div>
    </div>
  );
};
