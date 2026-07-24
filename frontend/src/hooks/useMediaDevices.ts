import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useMediaDevices = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeAudioInput, setActiveAudioInput] = useState<string>(localStorage.getItem('peerly_mic_id') || 'default');
  const [activeVideoInput, setActiveVideoInput] = useState<string>(localStorage.getItem('peerly_camera_id') || 'default');
  const [activeAudioOutput, setActiveAudioOutput] = useState<string>(localStorage.getItem('peerly_speaker_id') || 'default');
  const [hasPermissions, setHasPermissions] = useState<boolean | null>(null);

  const updateDeviceList = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);

      // Verify active devices still exist, fallback if disconnected
      if (activeAudioInput !== 'default') {
        const exists = list.some(d => d.kind === 'audioinput' && d.deviceId === activeAudioInput);
        if (!exists) {
          toast.error("Active microphone disconnected. Falling back to default.");
          setActiveAudioInput('default');
          localStorage.removeItem('peerly_mic_id');
        }
      }

      if (activeVideoInput !== 'default') {
        const exists = list.some(d => d.kind === 'videoinput' && d.deviceId === activeVideoInput);
        if (!exists) {
          toast.error("Active camera disconnected. Falling back to default.");
          setActiveVideoInput('default');
          localStorage.removeItem('peerly_camera_id');
        }
      }
    } catch (e) {
      console.error("[MediaDevices] Failed to list media devices", e);
    }
  }, [activeAudioInput, activeVideoInput]);

  const requestPermissions = useCallback(async (withVideo: boolean = true) => {
    try {
      const constraints = {
        audio: true,
        video: withVideo
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(t => t.stop());
      setHasPermissions(true);
      await updateDeviceList();
      return true;
    } catch (e) {
      console.error("[MediaDevices] Media permissions denied", e);
      setHasPermissions(false);
      toast.error("Media permission denied or devices unavailable.");
      return false;
    }
  }, [updateDeviceList]);

  useEffect(() => {
    const handleDeviceChange = () => {
      console.log("[MediaDevices] Hardware device change detected.");
      updateDeviceList();
    };

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    updateDeviceList();

    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [updateDeviceList]);

  const setAudioInput = useCallback((id: string) => {
    setActiveAudioInput(id);
    localStorage.setItem('peerly_mic_id', id);
  }, []);

  const setVideoInput = useCallback((id: string) => {
    setActiveVideoInput(id);
    localStorage.setItem('peerly_camera_id', id);
  }, []);

  const setAudioOutput = useCallback((id: string) => {
    setActiveAudioOutput(id);
    localStorage.setItem('peerly_speaker_id', id);
  }, []);

  return {
    devices,
    activeAudioInput,
    activeVideoInput,
    activeAudioOutput,
    hasPermissions,
    requestPermissions,
    setAudioInput,
    setVideoInput,
    setAudioOutput,
    updateDeviceList,
  };
};
