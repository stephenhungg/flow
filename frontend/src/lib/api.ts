/**
 * API client helpers for library endpoints
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Scene {
  _id: string;
  title: string;
  description?: string;
  concept: string;
  creatorId: string;
  creatorName: string;
  splatUrl: string;
  thumbnailBase64?: string | null;
  tags: string[];
  viewCount: number;
  createdAt: string;
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

