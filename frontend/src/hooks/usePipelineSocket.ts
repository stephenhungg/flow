/**
 * WebSocket hook for real-time pipeline updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

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
  const socketRef = useRef<Socket | null>(null);
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

  // Connect to socket
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('🔌 [SOCKET] Connected to server');
      setState(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('disconnect', () => {
      console.log('🔌 [SOCKET] Disconnected from server');
      setState(prev => ({ ...prev, isConnected: false }));
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

      // Pipeline doesn't require authentication - no auth headers needed
      const response = await fetch(`${API_URL}/api/pipeline/start`, {
        method: 'POST',
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
  // Reset state
  const reset = useCallback(() => {
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
    reset,
  };
}

