/**
 * API client helpers for library endpoints
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface OrchestrationData {
  learningObjectives: string[];
  keyFacts: string[];
  narrationScript: string;
  subtitleLines: Array<{ text: string; startTime: number; endTime: number }>;
  callouts: Array<{ id: string; text: string; position: { x: number; y: number; z: number } }>;
  sources: Array<{ title: string; url: string }>;
}

export interface Scene {
  _id: string;
  title: string;
  description?: string;
  concept: string;
  creatorId: string;
  creatorName: string;
  splatUrl: string;
  colliderMeshUrl?: string;
  worldId?: string;
  hasCollider?: boolean;
  thumbnailUrl?: string | null;
  animatedThumbnailUrl?: string | null;
  tags: string[];
  viewCount: number;
  createdAt: string;
  orchestration?: OrchestrationData | null;
}

export interface PaginatedScenes {
  scenes: Scene[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * List public scenes
 */
export async function listScenes(page: number = 1, limit: number = 20): Promise<PaginatedScenes> {
  const response = await fetch(`${API_URL}/api/scenes?page=${page}&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch scenes');
  }
  return response.json();
}

/**
 * Get scene by ID
 */
export async function getScene(id: string): Promise<Scene> {
  const response = await fetch(`${API_URL}/api/scenes/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch scene');
  }
  return response.json();
}

/**
 * Create a new scene
 */
export async function createScene(
  token: string,
  data: {
    title: string;
    description?: string;
    concept: string;
    tags?: string[];
    isPublic: boolean;
    thumbnailBase64?: string;
    splatFile: File;
  }
): Promise<Scene> {
  const formData = new FormData();
  formData.append('title', data.title);
  formData.append('concept', data.concept);
  if (data.description) formData.append('description', data.description);
  if (data.tags) formData.append('tags', JSON.stringify(data.tags));
  formData.append('isPublic', String(data.isPublic));
  if (data.thumbnailBase64) formData.append('thumbnailBase64', data.thumbnailBase64);
  formData.append('splatFile', data.splatFile);

  const response = await fetch(`${API_URL}/api/scenes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create scene');
  }

  return response.json();
}

/**
 * Delete a scene
 */
export async function deleteScene(token: string, sceneId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/scenes/${sceneId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete scene');
  }
}

/**
 * Get user's scenes
 */
export async function getUserScenes(userId: string): Promise<Scene[]> {
  const response = await fetch(`${API_URL}/api/users/${userId}/scenes`);
  if (!response.ok) {
    throw new Error('Failed to fetch user scenes');
  }
  const data = await response.json();
  return data.scenes;
}

/**
 * Get current user's scenes (including private)
 */
export async function getMyScenes(token: string): Promise<Scene[]> {
  const response = await fetch(`${API_URL}/api/users/me/scenes`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch your scenes');
  }
  const data = await response.json();
  return data.scenes;
}

/**
 * Create scene from external splat URL (auto-save from pipeline)
 * Also supports collider mesh URL for physics and orchestration data
 */
export async function createSceneFromUrl(
  token: string,
  data: {
    title: string;
    description?: string;
    concept: string;
    tags?: string[];
    isPublic?: boolean;
    splatUrl: string;
    colliderMeshUrl?: string;
    worldId?: string;
    orchestration?: OrchestrationData | null;
    thumbnailBase64?: string;
  }
): Promise<Scene> {
  const response = await fetch(`${API_URL}/api/scenes/from-url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: data.title,
      description: data.description,
      concept: data.concept,
      tags: data.tags,
      isPublic: data.isPublic ?? true,
      splatUrl: data.splatUrl,
      colliderMeshUrl: data.colliderMeshUrl,
      worldId: data.worldId,
      orchestration: data.orchestration,
      thumbnailBase64: data.thumbnailBase64,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create scene');
  }

  return response.json();
}

/**
 * Get proxied splat URL to bypass CORS
 * Use this when loading splats from Vultr Object Storage
 */
export function getProxiedSplatUrl(originalUrl: string): string {
  if (!originalUrl.includes('vultrobjects.com')) {
    return originalUrl; // Not a Vultr URL, return as-is
  }
  return `${API_URL}/api/proxy/splat?url=${encodeURIComponent(originalUrl)}`;
}

/**
 * Generate LLM description for a scene
 */
export async function generateSceneDescription(sceneId: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/scenes/${sceneId}/generate-description`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate description');
  }

  const data = await response.json();
  return data.description;
}

// ============================================
// Credits & Payment API
// ============================================

export interface CreditPackage {
  credits: number;
  price: number;
  priceCents: number;
}

/**
 * Get available credit packages
 */
export async function getCreditPackages(): Promise<CreditPackage[]> {
  const response = await fetch(`${API_URL}/api/credits/packages`);
  if (!response.ok) {
    throw new Error('Failed to fetch credit packages');
  }
  const data = await response.json();
  return data.packages;
}

/**
 * Create Stripe checkout session for purchasing credits
 */
export async function createCheckoutSession(
  token: string,
  packageId: number
): Promise<{ sessionId: string; url: string }> {
  const response = await fetch(`${API_URL}/api/credits/create-checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packageId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  return response.json();
}

/**
 * Verify Stripe checkout session and add credits (fallback if webhook hasn't fired)
 */
export async function verifyCheckoutSession(
  token: string,
  sessionId: string
): Promise<{ success: boolean; creditsAdded: number; totalCredits: number }> {
  const response = await fetch(`${API_URL}/api/credits/verify-session`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to verify session');
  }

  return response.json();
}

