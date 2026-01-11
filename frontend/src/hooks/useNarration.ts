import { useState, useCallback, useRef } from 'react';
import { useDeepgram } from './useDeepgram';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface UseNarrationProps {
  getScreenshot: () => string | null; // Returns base64 data URL
  concept: string;
}

export type NarrationStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export function useNarration({ getScreenshot, concept }: UseNarrationProps) {
  const [status, setStatus] = useState<NarrationStatus>('idle');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string>('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isProcessingRef = useRef(false);
  
  // Process and send a question to the AI
  const sendQuestion = useCallback(async (transcript: string) => {
    // Prevent duplicate processing
    if (!transcript.trim()) {
      console.log('🎤 [NARRATION] Empty transcript, skipping');
      return;
    }
    if (isProcessingRef.current) {
      console.log('🎤 [NARRATION] Already processing, skipping');
      return;
    }
    
    isProcessingRef.current = true;
    console.log('🎤 [NARRATION] Processing question:', transcript);
    setStatus('thinking');
    setError(null);
    setResponse(null); // Clear previous response
    setPendingTranscript('');
    
    try {
      // Capture what user is seeing
      const screenshot = getScreenshot();
      if (!screenshot) {
        throw new Error('Could not capture screenshot');
      }
      
      // Remove data URL prefix for API (expects raw base64)
      const base64 = screenshot.replace(/^data:image\/\w+;base64,/, '');
      
      console.log('🎤 [NARRATION] Sending to API...');
      
      // Ask the AI
      const res = await fetch(`${API_URL}/api/narration/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          screenshot: base64, 
          question: transcript, 
          concept 
        })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${res.status}`);
      }
      
      const { text, audio } = await res.json();
      console.log('🎤 [NARRATION] Got response:', text?.substring(0, 50) + '...');
      
      setResponse(text);
      setStatus('speaking');
      
      // Play audio if available
      if (audio) {
        try {
          const audioBlob = new Blob(
            [Uint8Array.from(atob(audio), c => c.charCodeAt(0))],
            { type: 'audio/mpeg' }
          );
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // Stop any existing audio
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
          }
          
          const audioEl = new Audio(audioUrl);
          audioRef.current = audioEl;
          
          audioEl.onended = () => {
            console.log('🎤 [NARRATION] Audio finished');
            setStatus('idle');
            isProcessingRef.current = false;
            URL.revokeObjectURL(audioUrl);
          };
          
          audioEl.onerror = (e) => {
            console.error('🎤 [NARRATION] Audio error:', e);
            setStatus('idle');
            isProcessingRef.current = false;
            URL.revokeObjectURL(audioUrl);
          };
          
          await audioEl.play();
          console.log('🎤 [NARRATION] Playing audio...');
        } catch (audioErr) {
          console.error('🎤 [NARRATION] Audio playback error:', audioErr);
          // Still show text even if audio fails
          setTimeout(() => {
            setStatus('idle');
            isProcessingRef.current = false;
          }, 3000);
        }
      } else {
        // No ElevenLabs audio - use browser's built-in speech synthesis as fallback
        console.log('🎤 [NARRATION] No ElevenLabs audio, trying browser speech...');
        
        if ('speechSynthesis' in window && text) {
          try {
            // Cancel any ongoing speech
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Try to use a nice voice if available
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => 
              v.name.includes('Samantha') || 
              v.name.includes('Karen') || 
              v.name.includes('Google') ||
              v.lang.startsWith('en')
            );
            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }
            
            utterance.onend = () => {
              console.log('🎤 [NARRATION] Browser speech finished');
              setStatus('idle');
              isProcessingRef.current = false;
            };
            
            utterance.onerror = () => {
              console.log('🎤 [NARRATION] Browser speech error, showing text only');
              setTimeout(() => {
                setStatus('idle');
                isProcessingRef.current = false;
              }, 5000);
            };
            
            window.speechSynthesis.speak(utterance);
            console.log('🎤 [NARRATION] Playing browser speech...');
          } catch (speechErr) {
            console.error('🎤 [NARRATION] Browser speech failed:', speechErr);
            setTimeout(() => {
              setStatus('idle');
              isProcessingRef.current = false;
            }, 5000);
          }
        } else {
          // No speech synthesis available, just show text
          console.log('🎤 [NARRATION] No speech available, showing text only');
          setTimeout(() => {
            setStatus('idle');
            isProcessingRef.current = false;
          }, 5000);
        }
      }
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('🎤 [NARRATION] Error:', errorMessage);
      setError(errorMessage);
      setStatus('idle');
      isProcessingRef.current = false;
    }
  }, [getScreenshot, concept]);

  // Handle incoming transcripts from Deepgram - just store them
  const handleTranscript = useCallback((transcript: string) => {
    console.log('🎤 [NARRATION] Got transcript:', transcript);
    setPendingTranscript(transcript);
  }, []);
  
  const deepgram = useDeepgram({
    onTranscript: handleTranscript
  });
  
  const startListening = useCallback(() => {
    if (status !== 'idle') {
      console.log('🎤 [NARRATION] Cannot start - status is:', status);
      return;
    }
    
    console.log('🎤 [NARRATION] Starting to listen...');
    // Reset ALL state for new conversation
    isProcessingRef.current = false; // Important: reset this!
    setStatus('listening');
    setError(null);
    setResponse(null);
    setPendingTranscript('');
    
    // Cancel any ongoing browser speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    deepgram.startListening();
  }, [deepgram, status]);
  
  // Stop listening AND send the question
  const stopAndSend = useCallback(() => {
    console.log('🎤 [NARRATION] Stopping and sending...');
    deepgram.stopListening();
    
    // Get the current transcript (either from pending or deepgram state)
    const transcriptToSend = pendingTranscript || deepgram.transcript;
    
    if (transcriptToSend && transcriptToSend.trim()) {
      console.log('🎤 [NARRATION] Sending question:', transcriptToSend);
      sendQuestion(transcriptToSend);
    } else {
      console.log('🎤 [NARRATION] No transcript to send');
      setStatus('idle');
    }
  }, [deepgram, pendingTranscript, sendQuestion]);
  
  const stopListening = useCallback(() => {
    console.log('🎤 [NARRATION] Stopping listening (no send)...');
    deepgram.stopListening();
    if (status === 'listening') {
      setStatus('idle');
    }
    setPendingTranscript('');
  }, [deepgram, status]);
  
  const interrupt = useCallback(() => {
    console.log('🎤 [NARRATION] Interrupting...');
    
    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    
    // Stop browser speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop listening if active
    deepgram.stopListening();
    
    // Reset state
    setStatus('idle');
    setResponse(null);
    isProcessingRef.current = false;
  }, [deepgram]);
  
  return {
    status,
    transcript: deepgram.transcript || pendingTranscript,
    pendingTranscript,
    response,
    error: error || deepgram.error,
    startListening,
    stopListening,
    stopAndSend, // Press T again to send
    interrupt,
    isListening: deepgram.isListening
  };
}

