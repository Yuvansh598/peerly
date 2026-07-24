import React from 'react';
import clsx from 'clsx';

interface ConnectionStatusProps {
  status: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const normalizedStatus = status.toLowerCase();

  const getStatusColor = () => {
    switch (normalizedStatus) {
      case 'connected':
      case 'active':
        return "bg-[#00f5a0] shadow-[0_0_10px_rgba(0,245,160,0.5)]";
      case 'connecting':
      case 'negotiating':
      case 'matched':
      case 'waiting':
      case 'searching':
        return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]";
      case 'reconnecting':
      case 'rematching':
        return "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]";
      case 'disconnected':
      case 'peer disconnected':
      case 'ended':
      case 'failed':
      case 'closed':
      default:
        return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]";
    }
  };

  const getDisplayLabel = () => {
    switch (normalizedStatus) {
      case 'new': return 'Negotiating';
      case 'active': return 'Connected';
      default: return status;
    }
  };

  return (
    <div className="flex items-center gap-2 select-none">
      <span className={clsx("w-2.5 h-2.5 rounded-full animate-pulse", getStatusColor())} />
      <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
        {getDisplayLabel()}
      </span>
    </div>
  );
};
