import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, glow, ...props }) => {
  return (
    <div
      className={clsx(
        "glass rounded-3xl p-6 transition-all duration-300 relative overflow-hidden",
        glow && "glass-glow",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
