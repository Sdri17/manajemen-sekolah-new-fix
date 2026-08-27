import React, { useRef, useEffect, useCallback } from 'react';
import { Mic, AlertCircle } from 'lucide-react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import toast from 'react-hot-toast';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  value?: string;
  appendMode?: boolean;
  className?: string;
  buttonText?: string;
  compact?: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  value = '',
  appendMode = true,
  className = '',
  buttonText,
  compact = false,
}) => {
  const onTranscriptRef = useRef(onTranscript);
  const valueRef = useRef(value);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    valueRef.current = value;
  });

  const handleResult = useCallback((newText: string) => {
    if (appendMode && valueRef.current) {
      onTranscriptRef.current(`${valueRef.current} ${newText}`.trim());
    } else {
      onTranscriptRef.current(newText);
    }
  }, [appendMode]);

  const { isListening, interimTranscript, toggleListening, isSupported, error } =
    useVoiceRecognition({
      onResult: handleResult,
    });

  const handleClick = () => {
    if (!isSupported) {
      toast.error('Browser Anda tidak mendukung fitur Dikte Suara (Speech Recognition).');
      return;
    }
    toggleListening();
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        className={`relative flex items-center justify-center gap-2 transition-all cursor-pointer select-none ${
          isListening
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 ring-2 ring-rose-400 border border-rose-300'
            : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
        } ${compact ? 'px-2.5 py-1.5 text-xs rounded-lg' : 'px-3.5 py-2 text-xs font-semibold rounded-xl'} ${className}`}
        title={
          isListening
            ? 'Perekaman Suara Aktif - Klik untuk Berhenti'
            : 'Klik untuk Dikte Suara (Voice to Text)'
        }
      >
        {isListening ? (
          <>
            {/* Pulsating Red Indicator Dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-100"></span>
            </span>

            {/* Visual Animated Waveform Feedback */}
            <div className="flex items-center gap-0.5 h-3 px-0.5">
              <span className="w-0.5 bg-white rounded-full animate-bounce h-full"></span>
              <span className="w-0.5 bg-white rounded-full animate-bounce h-2" style={{ animationDelay: '150ms' }}></span>
              <span className="w-0.5 bg-white rounded-full animate-bounce h-3" style={{ animationDelay: '300ms' }}></span>
              <span className="w-0.5 bg-white rounded-full animate-bounce h-1.5" style={{ animationDelay: '450ms' }}></span>
            </div>

            <span>{buttonText || 'Mendengarkan...'}</span>
          </>
        ) : (
          <>
            <Mic size={compact ? 14 : 16} className="shrink-0" />
            {!compact && <span>{buttonText || 'Dikte Suara'}</span>}
          </>
        )}
      </button>

      {/* Real-time Interim Live Preview Badge */}
      {isListening && interimTranscript && (
        <div className="text-[11px] text-amber-300 bg-slate-900/90 border border-amber-500/40 px-2.5 py-1 rounded-lg italic max-w-xs truncate animate-pulse shadow-md">
          "{interimTranscript}"
        </div>
      )}

      {error && (
        <span className="text-[10px] text-rose-400 flex items-center gap-1" title={error}>
          <AlertCircle size={12} /> Error Mic
        </span>
      )}
    </div>
  );
};

export default VoiceInputButton;
