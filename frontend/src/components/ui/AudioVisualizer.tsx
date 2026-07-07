import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  speaking: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, speaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !speaking) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let audioCtx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
    } catch (e) {
      console.warn("Failed to construct audio visualizer API context", e);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || !analyser) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = Math.max(4, height * percent);

        const gradient = ctx.createLinearGradient(0, height / 2 - barHeight / 2, 0, height / 2 + barHeight / 2);
        gradient.addColorStop(0, '#00f0ff');
        gradient.addColorStop(0.5, '#0072ff');
        gradient.addColorStop(1, '#9d4edd');

        ctx.fillStyle = gradient;
        
        ctx.beginPath();
        ctx.roundRect(x, height / 2 - barHeight / 2, barWidth - 4, barHeight, 4);
        ctx.fill();

        x += barWidth;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream, speaking]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={80}
      className="w-full h-20 max-w-xs mx-auto select-none pointer-events-none"
    />
  );
};
