/**
 * WebSocket hook for real-time pipeline updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

export type PipelineStage = 
  | 'idle'
  | 'orchestrating'
  | 'generating_image'
  | 'creating_world'
  | 'loading_splat'
  | 'complete'
  | 'error';

export interface PipelineMessage {
  id: string;
  stage: PipelineStage;
  message: string;
  timestamp: number;
}

export interface PipelineState {
  jobId: string | null;
  stage: PipelineStage;
  progress: number;
  message: string;
  details: string;
  messages: PipelineMessage[];
  splatUrl: string | null;
  splatUrlLowRes: string | null;
  colliderMeshUrl: string | null;
  worldId: string | null;
  thumbnailBase64: string | null;
  generatedImage: string | null; // Base64 of generated image (shown during loading)
  generatedImageMime: string | null;
  error: string | null;
  isConnected: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function usePipelineSocket() {
  const { getIdToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const [state, setState] = useState<PipelineState>({
    jobId: null,
    stage: 'idle',
    progress: 0,
    message: '',
    details: '',
    messages: [],
    splatUrl: null,
    splatUrlLowRes: null,
    colliderMeshUrl: null,
    worldId: null,
    thumbnailBase64: null,
    generatedImage: null,
    generatedImageMime: null,
    error: null,
    isConnected: false,
  });

  // Connect to socket with exponential backoff and jitter
  useEffect(() => {
    let reconnectAttempt = 0;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    const maxReconnectDelay = 30000; // 30 seconds max
    const baseDelay = 1000; // 1 second base
    const maxReconnectAttempts = Infinity; // Keep trying forever

    // Calculate exponential backoff with jitter
    const calculateBackoff = (attempt: number) => {
      // Exponential backoff: 2^attempt * baseDelay
      const exponentialDelay = Math.min(Math.pow(2, attempt) * baseDelay, maxReconnectDelay);
      // Add random jitter (0-25% of delay) to prevent thundering herd
      const jitter = Math.random() * exponentialDelay * 0.25;
      return exponentialDelay + jitter;
    };

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: baseDelay,
      reconnectionDelayMax: maxReconnectDelay,
      timeout: 20000,
      // Custom reconnection logic
      randomizationFactor: 0.25, // Add 25% randomization to delays
    });

    socket.on('connect', () => {
      console.log('🔌 [SOCKET] Connected to server');
      reconnectAttempt = 0; // Reset attempt counter on successful connection
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      setState(prev => ({ ...prev, isConnected: true, error: null }));

      // Rejoin pipeline room if we have an active job
      if (activeJobIdRef.current) {
        console.log('🔄 [SOCKET] Rejoining pipeline room:', activeJobIdRef.current);
        socket.emit('join-pipeline', activeJobIdRef.current);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [SOCKET] Disconnected from server:', reason);
      setState(prev => ({ ...prev, isConnected: false }));

      // If disconnect wasn't intentional, show user-friendly message
      if (reason === 'io server disconnect') {
        setState(prev => ({ ...prev, message: 'Server disconnected. Please refresh the page.' }));
      } else if (reason === 'ping timeout' || reason === 'transport close') {
        setState(prev => ({ ...prev, message: 'Connection lost. Reconnecting...' }));
      }
    });

    socket.on('connect_error', (error) => {
      reconnectAttempt++;
      const backoffDelay = calculateBackoff(reconnectAttempt);
      console.warn(`⚠️ [SOCKET] Connection error (attempt ${reconnectAttempt}):`, error.message);
      console.log(`⏱️ [SOCKET] Next retry in ${Math.round(backoffDelay / 1000)}s`);

      // Update UI with reconnection status
      setState(prev => ({
        ...prev,
        message: `Reconnecting... (attempt ${reconnectAttempt}, next try in ${Math.round(backoffDelay / 1000)}s)`
      }));
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 [SOCKET] Reconnected after', attemptNumber, 'attempts');
      setState(prev => ({ ...prev, message: 'Reconnected successfully' }));
      // Clear message after 2 seconds
      setTimeout(() => {
        setState(prev => ({ ...prev, message: '' }));
      }, 2000);
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 [SOCKET] Reconnection attempt', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.warn('⚠️ [SOCKET] Reconnection error:', error.message);
    });

    socket.on('reconnect_failed', () => {
      console.error('❌ [SOCKET] Reconnection failed after max attempts');
      setState(prev => ({
        ...prev,
        error: 'Connection failed. Please refresh the page.',
        message: 'Connection failed. Please refresh the page.'
      }));
    });

    socket.on('pipeline:progress', (data) => {
      console.log('📡 [SOCKET] Pipeline update:', data);

      const newMessage: PipelineMessage = {
        id: `${data.timestamp}_${Math.random()}`,
        stage: data.stage,
        message: data.message,
        timestamp: data.timestamp,
      };

      setState(prev => ({
        ...prev,
        stage: data.stage,
        progress: data.progress,
        message: data.message,
        details: data.details || '',
        messages: [...prev.messages.slice(-20), newMessage], // Keep last 20 messages
        splatUrl: data.splatUrl || prev.splatUrl,
        splatUrlLowRes: data.splatUrlLowRes || prev.splatUrlLowRes,
        colliderMeshUrl: data.colliderMeshUrl || prev.colliderMeshUrl,
        worldId: data.worldId || prev.worldId,
        thumbnailBase64: data.thumbnailBase64 || prev.thumbnailBase64,
        generatedImage: data.generatedImage || prev.generatedImage,
        generatedImageMime: data.generatedImageMime || prev.generatedImageMime,
        error: data.error ? data.message : null,
      }));
    });

    socketRef.current = socket;

    return () => {
      console.log('🧹 [SOCKET] Cleaning up socket connection');
      socket.disconnect();
    };
  }, []);

  // Start pipeline
  const startPipeline = useCallback(async (concept: string, imageFile?: File, quality?: string) => {
    setState(prev => ({
      ...prev,
      stage: 'orchestrating',
      progress: 0,
      message: 'Starting pipeline...', 
      messages: [],
      splatUrl: null,
      splatUrlLowRes: null,
      colliderMeshUrl: null,
      worldId: null,
      thumbnailBase64: null,
      generatedImage: null,
      generatedImageMime: null,
      error: null,
    }));

    try {
      const formData = new FormData();
      formData.append('concept', concept);
      if (imageFile) {
        formData.append('image', imageFile);
      }
      if (quality) {
        formData.append('quality', quality);
      }

      // Get auth token for pipeline request
      const token = await getIdToken();
      if (!token) {
        throw new Error('Please sign in to generate scenes');
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/api/pipeline/start`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start pipeline');
      }

      const { jobId } = await response.json();
      
      // Join the pipeline room
      if (socketRef.current) {
        socketRef.current.emit('join-pipeline', jobId);
      }

      setState(prev => ({ ...prev, jobId }));
      activeJobIdRef.current = jobId;

      return jobId;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        stage: 'error',
        error: error.message,
        message: 'Failed to start pipeline',
      }));
      throw error;
    }
  }, []);
  // Cancel pipeline
  const cancelPipeline = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId) {
      console.log('⚠️ [PIPELINE] No active job to cancel');
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) {
        console.warn('⚠️ [PIPELINE] Not signed in, cannot cancel');
        return;
      }

      console.log('🛑 [PIPELINE] Cancelling job:', jobId);
      
      const response = await fetch(`${API_URL}/api/pipeline/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to cancel pipeline');
      }

      // Leave the pipeline room
      if (socketRef.current) {
        socketRef.current.emit('leave-pipeline', jobId);
      }

      // Reset state
      activeJobIdRef.current = null;
      setState(prev => ({
        ...prev,
        stage: 'idle',
        jobId: null,
        message: 'Pipeline cancelled',
        error: 'Pipeline cancelled by user',
      }));

      console.log('✅ [PIPELINE] Pipeline cancelled successfully');
    } catch (error: any) {
      console.error('❌ [PIPELINE] Failed to cancel:', error);
      // Still reset state even if cancel request failed
      activeJobIdRef.current = null;
      setState(prev => ({
        ...prev,
        stage: 'idle',
        jobId: null,
        message: 'Pipeline cancelled',
        error: 'Pipeline cancelled',
      }));
    }
  }, [getIdToken]);

  // Reset state
  const reset = useCallback(() => {
    activeJobIdRef.current = null;
    setState({
      jobId: null,
      stage: 'idle',
      progress: 0,
      message: '',
      details: '',
      messages: [],
      splatUrl: null,
      splatUrlLowRes: null,
      colliderMeshUrl: null,
      worldId: null,
      thumbnailBase64: null,
      generatedImage: null,
      generatedImageMime: null,
      error: null,
      isConnected: state.isConnected,
    });
  }, [state.isConnected]);

  return {
    ...state,
    startPipeline,
    cancelPipeline,
    reset,
  };
}

