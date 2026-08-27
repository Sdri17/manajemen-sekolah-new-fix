import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVoiceRecognitionOptions {
  onResult?: (transcript: string) => void;
  language?: string;
  continuous?: boolean;
}

export function useVoiceRecognition(options: UseVoiceRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const optionsRef = useRef<UseVoiceRecognitionOptions>(options);

  // Keep optionsRef current on every render
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const getLanguage = useCallback(() => {
    if (optionsRef.current.language) return optionsRef.current.language;
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('voice_transcription_lang');
      if (savedLang) return savedLang;
    }
    return 'id-ID';
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Browser tidak mendukung Speech Recognition');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = optionsRef.current.continuous ?? true;
      recognition.interimResults = true;
      recognition.lang = getLanguage();

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let newlyFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newlyFinal += trans;
          } else {
            currentInterim += trans;
          }
        }

        setInterimTranscript(currentInterim);

        if (newlyFinal) {
          setTranscript((prev) => (prev ? `${prev} ${newlyFinal}`.trim() : newlyFinal.trim()));
          if (optionsRef.current.onResult) {
            optionsRef.current.onResult(newlyFinal);
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setError(`Error mikrofon: ${event.error}`);
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setError(err?.message || 'Gagal mengaktifkan mikrofon');
      setIsListening(false);
    }
  }, [getLanguage]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    setTranscript,
  };
}
