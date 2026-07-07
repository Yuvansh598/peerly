import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  ...props
}) => {
  return (
    <motion.button
      whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
      whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
      disabled={disabled || loading}
      className={clsx(
        "rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none relative overflow-hidden",
        {
          "px-4 py-2 text-sm": size === 'sm',
          "px-6 py-3.5 text-base": size === 'md',
          "px-8 py-4 text-lg": size === 'lg',
          
          "bg-[#00f0ff] text-black hover:bg-[#33f3ff] shadow-[0_0_20px_rgba(0,240,255,0.2)] hover:shadow-[0_0_30px_rgba(0,240,255,0.35)]": variant === 'primary',
          "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white": variant === 'secondary',
          "bg-[#ff4d6d] text-white hover:bg-[#ff6b84] shadow-[0_0_20px_rgba(255,77,109,0.2)]": variant === 'danger',
          "glass text-white hover:bg-white/10": variant === 'glass'
        },
        className
      )}
      {...props as any}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : children}
    </motion.button>
  );
};
