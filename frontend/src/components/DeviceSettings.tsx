import { Settings, X, Mic, Video, Volume2 } from 'lucide-react';
import { Card } from './ui/Card';

type DeviceSettingsProps = {
  onClose: () => void;
  onDeviceChange: (type: 'audioinput' | 'videoinput' | 'audiooutput', deviceId: string) => void;
  devices: MediaDeviceInfo[];
  currentAudio: string;
  currentVideo: string;
  currentOutput: string;
};

export const DeviceSettings = ({ onClose, onDeviceChange, devices, currentAudio, currentVideo, currentOutput }: DeviceSettingsProps) => {
  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const videoInputs = devices.filter(d => d.kind === 'videoinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none">
      <Card glow className="w-full max-w-md border border-white/10 shadow-2xl p-0 overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2 font-bold text-lg text-white">
            <Settings size={18} className="text-[#00f0ff]"/> Device Configuration
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-gray-400 hover:text-white">
            <X size={18}/>
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2 px-1">
              <Mic size={14} className="text-[#00f0ff]"/> Microphone Input
            </label>
            <select 
              value={currentAudio}
              onChange={(e) => onDeviceChange('audioinput', e.target.value)}
              className="bg-black/30 text-sm border border-white/10 rounded-xl p-3 outline-none focus:border-[#00f0ff] transition-colors text-white"
            >
              {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-[#070913] text-white">{d.label || `Microphone ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2 px-1">
              <Video size={14} className="text-[#00f0ff]"/> Camera Input
            </label>
            <select 
              value={currentVideo}
              onChange={(e) => onDeviceChange('videoinput', e.target.value)}
              className="bg-black/30 text-sm border border-white/10 rounded-xl p-3 outline-none focus:border-[#00f0ff] transition-colors text-white"
            >
              {videoInputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-[#070913] text-white">{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
          </div>

          {audioOutputs.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2 px-1">
                <Volume2 size={14} className="text-[#00f0ff]"/> Speaker Output
              </label>
              <select 
                value={currentOutput}
                onChange={(e) => onDeviceChange('audiooutput', e.target.value)}
                className="bg-black/30 text-sm border border-white/10 rounded-xl p-3 outline-none focus:border-[#00f0ff] transition-colors text-white"
              >
                {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId} className="bg-[#070913] text-white">{d.label || `Speaker ${d.deviceId.slice(0,5)}`}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
