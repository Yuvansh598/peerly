import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, circle }) => {
  return (
    <div
      className={clsx(
        "animate-pulse bg-white/5",
        circle ? "rounded-full" : "rounded-xl",
        className
      )}
    />
  );
};
