
import React, { useState, useEffect, useRef } from 'react';

interface AudioPlayerProps {
  base64Audio?: string; // For Gemini PCM
  audioUrl?: string;    // For standard audio files (Blob URLs)
  autoPlay?: boolean;
  onEnded?: () => void;
  label?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ base64Audio, audioUrl, autoPlay = false, onEnded, label }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Gemini TTS returns raw PCM data (16-bit, 24kHz, Mono)
  const decodePCM = (base64: string, ctx: AudioContext): AudioBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const int16Data = new Int16Array(bytes.buffer);
    const float32Data = new Float32Array(int16Data.length);
    
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768.0;
    }

    const buffer = ctx.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);
    return buffer;
  };

  const playAudio = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      setIsPlaying(true);

      let buffer: AudioBuffer;

      if (base64Audio) {
          // Manual PCM Decode for Gemini
          buffer = decodePCM(base64Audio, ctx);
      } else if (audioUrl) {
          // Fetch and Decode for standard formats (User Recording)
          const response = await fetch(audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
      } else {
          throw new Error("No audio source provided");
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        if (onEnded) onEnded();
      };

      source.start(0);
      sourceRef.current = source;
      
    } catch (error) {
      console.error("Audio playback error:", error);
      setIsPlaying(false);
      alert("Could not play audio.");
    }
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {
        // Ignore
      }
      sourceRef.current = null;
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    if (autoPlay) {
      playAudio();
    }
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div 
      className={`flex items-center space-x-3 bg-blue-50 border border-blue-100 p-3 rounded-xl max-w-xs cursor-pointer hover:bg-blue-100 transition-colors select-none ${isPlaying ? 'ring-2 ring-blue-200' : ''}`} 
      onClick={playAudio}
    >
      <button 
        className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-white shadow-sm transition-all ${isPlaying ? 'bg-blue-500 scale-95' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        )}
      </button>
      
      <div className="flex flex-col min-w-0">
         <span className="text-sm font-semibold text-slate-800 truncate">{label || "Audio Clip"}</span>
         <div className="flex items-center space-x-1">
             {isPlaying && (
                 <div className="flex space-x-0.5 h-2 items-end">
                     <div className="w-0.5 bg-blue-500 animate-[bounce_0.8s_infinite] h-1.5"></div>
                     <div className="w-0.5 bg-blue-500 animate-[bounce_1s_infinite] h-2"></div>
                     <div className="w-0.5 bg-blue-500 animate-[bounce_0.6s_infinite] h-1"></div>
                 </div>
             )}
             <span className="text-xs text-slate-500 font-medium">{isPlaying ? "Playing..." : "Tap to listen"}</span>
         </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
