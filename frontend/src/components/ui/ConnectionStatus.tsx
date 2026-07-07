import React from 'react';
import clsx from 'clsx';

interface ConnectionStatusProps {
  status: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  return (
    <div className="flex items-center gap-2 select-none">
      <span
        className={clsx(
          "w-2.5 h-2.5 rounded-full animate-pulse",
          {
            "bg-[#00f5a0] shadow-[0_0_10px_rgba(0,245,160,0.5)]": status === 'connected' || status === 'active',
            "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]": status === 'connecting' || status === 'waiting' || status === 'matched',
            "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]": status === 'disconnected' || status === 'ended' || status === 'failed'
          }
        )}
      />
      <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
        {status}
      </span>
    </div>
  );
};
