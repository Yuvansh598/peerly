import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './Card';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md z-10"
          >
            <Card glow className="p-8 border border-white/10">
              <div className="flex justify-between items-center mb-6">
                {title && <h3 className="text-xl font-bold text-white">{title}</h3>}
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              {children}
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
