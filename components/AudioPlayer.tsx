
import React, { useState, useEffect, useRef } from 'react';

interface AudioPlayerProps {
  base64Audio?: string; // For Gemini PCM
  audioUrl?: string;    // For standard audio files (Blob URLs)
  textToSpeak?: string; // High-quality Fallback text
  autoPlay?: boolean;
  onEnded?: () => void;
  onRetry?: () => Promise<void>; 
  label?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ base64Audio, audioUrl, textToSpeak, autoPlay = false, onEnded, onRetry, label }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Determine if we are using the fallback (High Quality Browser TTS)
  const isFallback = !base64Audio && !audioUrl && !!textToSpeak;
  const isErrorState = !base64Audio && !audioUrl && !textToSpeak;

  // --- Voice Selection Logic ---
  const getBestVoice = (): SpeechSynthesisVoice | null => {
      if (!synthRef.current) return null;
      const voices = synthRef.current.getVoices();
      
      // Tier 1: Microsoft Edge "Natural" Voices (The best "free" voices available in browsers)
      let voice = voices.find(v => v.name.includes("Natural") && v.lang.startsWith("en-US"));
      if (voice) return voice;

      // Tier 2: Google Voices (Chrome's online voices)
      voice = voices.find(v => v.name.includes("Google US English"));
      if (voice) return voice;

      // Tier 3: Apple Premium/Enhanced (Safari/macOS)
      voice = voices.find(v => (v.name.includes("Premium") || v.name.includes("Enhanced") || v.name.includes("Siri")) && v.lang.startsWith("en"));
      if (voice) return voice;

      // Tier 4: Any standard US English
      return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en')) || null;
  };

  const playBrowserTTS = () => {
      if (!synthRef.current || !textToSpeak) return;
      
      // Cancel previous
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      const voice = getBestVoice();
      
      if (voice) {
          utterance.voice = voice;
          // Natural voices usually sound better at slightly slower speeds
          utterance.rate = 0.9; 
          utterance.pitch = 1.0;
      }

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => {
          setIsPlaying(false);
          if (onEnded) onEnded();
      };
      utterance.onerror = () => setIsPlaying(false);

      synthRef.current.speak(utterance);
  };

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

    if (isFallback) {
        playBrowserTTS();
        return;
    }

    if (isErrorState) {
        if (onRetry) handleRetryClick();
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
          buffer = decodePCM(base64Audio, ctx);
      } else if (audioUrl) {
          const response = await fetch(audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
      } else {
          throw new Error("No audio source");
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
    }
  };

  const stopAudio = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current = null;
    }
    if (synthRef.current) {
        synthRef.current.cancel();
    }
    setIsPlaying(false);
  };

  const handleRetryClick = async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!onRetry || isRetrying) return;
      
      setIsRetrying(true);
      try {
          await onRetry();
      } finally {
          setIsRetrying(false);
      }
  };

  useEffect(() => {
    // Force browser to load voices early
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.getVoices();
    }

    if (autoPlay) {
        setTimeout(() => playAudio(), 100);
    }
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base64Audio, audioUrl]);

  return (
    <div className="flex items-center space-x-2">
        <div 
        className={`flex items-center space-x-3 p-3 rounded-xl max-w-xs cursor-pointer transition-colors select-none 
            ${isErrorState ? 'bg-red-50 border border-red-100' : ''}
            ${isFallback ? 'bg-amber-50 border border-amber-100 hover:bg-amber-100' : 'bg-blue-50 border border-blue-100 hover:bg-blue-100'}
            ${isPlaying ? (isFallback ? 'ring-2 ring-amber-200' : 'ring-2 ring-blue-200') : ''}
        `} 
        onClick={playAudio}
        >
        <button 
            className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-white shadow-sm transition-all 
                ${isPlaying ? 'scale-95' : ''}
                ${isErrorState ? 'bg-red-400' : (isFallback ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700')}
            `}
        >
            {isRetrying ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
            ) : isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
            )}
        </button>
        
        <div className="flex flex-col min-w-0">
            <span className={`text-sm font-semibold truncate ${isFallback ? 'text-amber-800' : (isErrorState ? 'text-red-700' : 'text-slate-800')}`}>
                {label || (isFallback ? "Teacher (Backup)" : "Teacher (HD)")}
            </span>
            <div className="flex items-center space-x-1">
                {isRetrying ? (
                    <span className="text-xs text-slate-500 font-medium italic">Retrying HD Voice...</span>
                ) : isErrorState ? (
                    <span className="text-xs text-red-500 font-medium">Load failed (Tap to retry)</span>
                ) : isPlaying ? (
                    <div className="flex space-x-0.5 h-2 items-end">
                        <div className={`w-0.5 animate-[bounce_0.8s_infinite] h-1.5 ${isFallback ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                        <div className={`w-0.5 animate-[bounce_1s_infinite] h-2 ${isFallback ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                        <div className={`w-0.5 animate-[bounce_0.6s_infinite] h-1 ${isFallback ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                    </div>
                ) : (
                    <span className="text-xs text-slate-500 font-medium">Tap to listen</span>
                )}
            </div>
        </div>
        </div>
        
        {/* Retry Button only appears if we are in fallback mode, allowing user to try for HD again */}
        {isFallback && onRetry && (
            <button 
                onClick={handleRetryClick}
                disabled={isRetrying}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-all"
                title="Try to load High-Quality Voice again"
            >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
        )}
    </div>
  );
};

export default AudioPlayer;
