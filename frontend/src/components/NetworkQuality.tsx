import { useEffect, useState } from 'react';
import { Signal, SignalHigh, SignalMedium, SignalLow } from 'lucide-react';

export const NetworkQuality = ({ pc }: { pc: RTCPeerConnection | null }) => {
  const [quality, setQuality] = useState<'Excellent' | 'Good' | 'Fair' | 'Poor'>('Excellent');

  useEffect(() => {
    if (!pc) return;

    const interval = setInterval(async () => {
      if (pc.connectionState !== 'connected') {
        setQuality('Poor');
        return;
      }

      try {
        const stats = await pc.getStats();
        let maxRtt = 0;
        let totalPacketsLost = 0;
        let totalPackets = 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime) {
              maxRtt = Math.max(maxRtt, report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'inbound-rtp') {
            if (report.packetsLost) totalPacketsLost += report.packetsLost;
            if (report.packetsReceived) totalPackets += report.packetsReceived;
          }
        });

        const lossRatio = totalPackets > 0 ? (totalPacketsLost / totalPackets) : 0;

        if (maxRtt > 300 || lossRatio > 0.05) {
          setQuality('Poor');
        } else if (maxRtt > 150 || lossRatio > 0.02) {
          setQuality('Fair');
        } else if (maxRtt > 80 || lossRatio > 0.005) {
          setQuality('Good');
        } else {
          setQuality('Excellent');
        }
      } catch (e) {
        // Ignore errors if stats fail
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pc]);

  return (
    <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-full text-xs font-medium border border-white/10" title={`Network: ${quality}`}>
      {quality === 'Excellent' && <SignalHigh size={14} className="text-green-500" />}
      {quality === 'Good' && <SignalMedium size={14} className="text-yellow-400" />}
      {quality === 'Fair' && <SignalLow size={14} className="text-orange-500" />}
      {quality === 'Poor' && <Signal size={14} className="text-red-500" />}
    </div>
  );
};
