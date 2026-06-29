import { useState, useEffect } from 'react';
import { Settings, X, Mic, Video, Volume2 } from 'lucide-react';

type DeviceSettingsProps = {
  onClose: () => void;
  onDeviceChange: (type: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string) => void;
  currentAudio: string;
  currentVideo: string;
  currentOutput: string;
};

export const DeviceSettings = ({ onClose, onDeviceChange, currentAudio, currentVideo, currentOutput }: DeviceSettingsProps) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices);
  }, []);

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const videoInputs = devices.filter(d => d.kind === 'videoinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#1a1b1e] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2 font-bold text-lg"><Settings size={20}/> Device Settings</div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors"><X size={20}/></button>
        </div>
        
        <div className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
              <Mic size={16}/> Microphone
            </label>
            <select 
              value={currentAudio}
              onChange={(e) => onDeviceChange('audioinput', e.target.value)}
              className="bg-[#0F1015] border border-white/10 rounded-xl p-3 outline-none focus:border-[var(--color-accent)] transition-colors"
            >
              {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
              <Video size={16}/> Camera
            </label>
            <select 
              value={currentVideo}
              onChange={(e) => onDeviceChange('videoinput', e.target.value)}
              className="bg-[#0F1015] border border-white/10 rounded-xl p-3 outline-none focus:border-[var(--color-accent)] transition-colors"
            >
              {videoInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
          </div>

          {audioOutputs.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-2">
                <Volume2 size={16}/> Speaker Output
              </label>
              <select 
                value={currentOutput}
                onChange={(e) => onDeviceChange('audiooutput', e.target.value)}
                className="bg-[#0F1015] border border-white/10 rounded-xl p-3 outline-none focus:border-[var(--color-accent)] transition-colors"
              >
                {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,5)}`}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
