import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const TIPS = [
  "Be respectful and keep conversations safe.",
  "Press Esc anytime to leave or skip immediately.",
  "Type your interests (e.g. anime, gaming) to match with like-minded users.",
  "Make sure you're in a well-lit area for video chat.",
  "Anonymity is key: avoid sharing sensitive personal details.",
  "Have fun and smile, a friendly hello goes a long way!"
];

export const SearchingScreen = ({ onCancel }: { onCancel: () => void }) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 4500);
    const timeInterval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => {
      clearInterval(tipInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-[#070913] text-white p-6 relative overflow-hidden select-none">
      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-[#00f0ff]/10 blur-sm"
            style={{
              width: Math.random() * 20 + 8,
              height: Math.random() * 20 + 8,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`
            }}
            animate={{
              y: [0, -100, 0],
              opacity: [0, 0.4, 0]
            }}
            transition={{
              duration: Math.random() * 8 + 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* Pulsing Radar Circle */}
      <div className="relative mb-12 flex items-center justify-center w-64 h-64">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#00f0ff]/30 pointer-events-none"
            initial={{ width: 64, height: 64, opacity: 0.8 }}
            animate={{
              width: 256,
              height: 256,
              opacity: 0
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 1,
              ease: "easeOut"
            }}
          />
        ))}
        
        {/* Core Glowing Dot */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#00f0ff] to-[#0072ff] flex items-center justify-center shadow-[0_0_40px_rgba(0,240,255,0.4)] relative z-10 border border-white/10"
        >
          <div className="w-6 h-6 rounded-full bg-white/20 animate-ping" />
        </motion.div>
      </div>
      
      {/* Title */}
      <h2 className="text-3xl font-bold mb-2 tracking-tight text-glow bg-clip-text text-transparent bg-gradient-to-r from-white to-[#8e9bb0]">
        Searching for Peer...
      </h2>
      
      <div className="text-[#00f0ff] font-mono text-lg tracking-wider mb-8 bg-[#00f0ff]/5 border border-[#00f0ff]/20 px-4 py-1.5 rounded-full backdrop-blur-sm">
        {formatTime(elapsed)}
      </div>

      {/* Tip Card */}
      <Card className="max-w-sm w-full text-center mb-10 border border-white/5 shadow-2xl min-h-[140px] flex flex-col justify-center">
        <div className="text-xs text-[#00f0ff] uppercase tracking-widest font-bold mb-3">Matching Advice</div>
        <div className="text-[#f0f4ff]/80 text-sm leading-relaxed px-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </Card>

      {/* Cancel Button */}
      <Button 
        onClick={onCancel}
        variant="secondary"
        size="md"
        className="border-white/10 hover:border-white/20 text-white min-w-[160px]"
      >
        Cancel Match
      </Button>
    </div>
  );
};
