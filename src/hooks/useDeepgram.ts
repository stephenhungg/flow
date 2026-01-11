import { useEffect, useRef, useState } from "react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

interface UseDeepgramOptions {
  onTranscript?: (transcript: string) => void;
  onCommandDetected?: (command: string) => void;
}

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || 'addf9b125d8e6991e085a0abb1103e2cf140aafd'; // ✅ fallback for hackathon

export function useDeepgram({ onTranscript, onCommandDetected }: UseDeepgramOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // ✅ prevents later interim/empty events from overwriting your final text
  const lockedRef = useRef(false);
  const finalTextRef = useRef("");

  const stopListening = () => {
    // lock state stays as-is; stop just stops streaming
    if (connectionRef.current) {
      try {
        connectionRef.current.requestClose();
      } catch {}
      connectionRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    setIsListening(false);
  };

  const lockAndStop = (finalText: string, command?: string) => {
    lockedRef.current = true;
    finalTextRef.current = finalText;

    // Freeze UI to this
    setTranscript(finalText);

    // stop safely after this callback finishes
    setTimeout(() => stopListening(), 0);

    if (command) onCommandDetected?.(command);
    onTranscript?.(finalText);
  };

  const startListening = async () => {
    try {
      setError(null);

      // reset for new session
      lockedRef.current = false;
      finalTextRef.current = "";
      setTranscript("");

      if (!DEEPGRAM_API_KEY) {
        setError("Missing VITE_DEEPGRAM_API_KEY");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // ✅ create ONE AudioContext and use it everywhere
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const sampleRate = audioContext.sampleRate;
      console.log("🎚️ AudioContext sampleRate:", sampleRate);

      const deepgram = createClient(DEEPGRAM_API_KEY);

      const connection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        interim_results: true,
        vad_events: true,
        utterance_end_ms: 1500, // ✅ less twitchy than 1000
        encoding: "linear16",
        sample_rate: sampleRate,
        channels: 1,
      });

      connectionRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("✅ Deepgram open");
        setIsListening(true);

        const source = audioContext.createMediaStreamSource(stream);

        // ✅ FORCE MONO (fixes the "Array(2)" channel events)
        const splitter = audioContext.createChannelSplitter(source.channelCount);
        const merger = audioContext.createChannelMerger(1);
        splitter.connect(merger, 0, 0);

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!connection.isConnected() || lockedRef.current) return;

          const input = e.inputBuffer.getChannelData(0);

          // ✅ float32 → int16 PCM
          const buffer = new ArrayBuffer(input.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < input.length; i++) {
            let s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }

          connection.send(buffer);
        };

        source.connect(splitter);
        merger.connect(processor);
        processor.connect(audioContext.destination);
        console.log("🎵 Streaming audio");
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        if (lockedRef.current) return;

        const text = (data.channel?.alternatives?.[0]?.transcript ?? "").trim();
        const isFinal = data.is_final === true;

        // ✅ ignore empty transcripts (normal)
        if (!text) return;

        // Show live updates while listening
        setTranscript(text);

        if (!isFinal) return;

        // ✅ Normalize for command detection
        const lower = text.toLowerCase().replace(/[.?!]+$/, "").trim();

        // Minimal command parse:
        // "show me ancient rome" → command scene = "ancient rome"
        if (lower.startsWith("show me ")) {
          const scene = lower.replace(/^show me\s+/, "").trim();

          // Lock & stop for ANY "show me X" command
          if (scene) {
            lockAndStop(text, scene);
            return;
          }
        }

        // If not a command, still keep final transcript in UI
        // (but do NOT auto-stop unless you want it)
      });

      connection.on(LiveTranscriptionEvents.Error, (e: any) => {
        console.error("❌ Deepgram error:", e);
        setError(e?.message || "Deepgram error");
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("🔌 Deepgram closed");
        setIsListening(false);
      });
    } catch (err: any) {
      console.error("startListening error:", err);
      setError(err?.message || "Failed to start listening");
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isListening, transcript, error, startListening, stopListening };
}
