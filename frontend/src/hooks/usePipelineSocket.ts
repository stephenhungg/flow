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

  // Connect to socket with auto-reconnection
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('🔌 [SOCKET] Connected to server');
      setState(prev => ({ ...prev, isConnected: true }));

      // Rejoin pipeline room if we have an active job
      if (activeJobIdRef.current) {
        console.log('🔄 [SOCKET] Rejoining pipeline room:', activeJobIdRef.current);
        socket.emit('join-pipeline', activeJobIdRef.current);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [SOCKET] Disconnected from server:', reason);
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('connect_error', (error) => {
      console.warn('⚠️ [SOCKET] Connection error:', error.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 [SOCKET] Reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 [SOCKET] Reconnection attempt', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.warn('⚠️ [SOCKET] Reconnection error:', error.message);
    });

    socket.on('reconnect_failed', () => {
      console.error('❌ [SOCKET] Reconnection failed after max attempts');
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

