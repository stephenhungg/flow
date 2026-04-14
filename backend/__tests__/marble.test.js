/**
 * Tests for lib/marble.js
 * Marble API client: URL extraction, API calls, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('node-fetch', () => ({
  default: mockFetch,
}));

import {
  extractSplatUrl,
  extractColliderMeshUrl,
  extractLowResSplatUrl,
  prepareMediaUpload,
  uploadToSignedUrl,
  generateWorld,
  checkOperationStatus,
  fetchWorld,
  MARBLE_API_BASE,
} from '../lib/marble.js';

describe('extractSplatUrl', () => {
  it('returns null for empty world data', () => {
    expect(extractSplatUrl({})).toBeNull();
    expect(extractSplatUrl(null)).toBeNull();
  });

  it('extracts full_res splat URL from assets.splats.spz_urls', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            full_res: 'https://example.com/splat_full.spz',
          },
        },
      },
    };
    expect(extractSplatUrl(worldData)).toBe('https://example.com/splat_full.spz');
  });

  it('falls back to 500k splat URL', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            '500k': 'https://example.com/splat_500k.spz',
          },
        },
      },
    };
    expect(extractSplatUrl(worldData)).toBe('https://example.com/splat_500k.spz');
  });

  it('falls back to 100k splat URL', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            '100k': 'https://example.com/splat_100k.spz',
          },
        },
      },
    };
    expect(extractSplatUrl(worldData)).toBe('https://example.com/splat_100k.spz');
  });

  it('prefers operation response splat_url over world data', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            full_res: 'https://example.com/world_splat.spz',
          },
        },
      },
    };
    const statusData = {
      response: {
        splat_url: 'https://example.com/response_splat.spz',
      },
    };
    expect(extractSplatUrl(worldData, statusData)).toBe('https://example.com/response_splat.spz');
  });

  it('extracts from statusData.response.assets path', () => {
    const statusData = {
      response: {
        assets: {
          splats: {
            spz_urls: {
              full_res: 'https://example.com/status_asset_splat.spz',
            },
          },
        },
      },
    };
    expect(extractSplatUrl({}, statusData)).toBe('https://example.com/status_asset_splat.spz');
  });

  it('extracts from statusData.response.world path', () => {
    const statusData = {
      response: {
        world: {
          assets: {
            splats: {
              spz_urls: {
                full_res: 'https://example.com/world_asset_splat.spz',
              },
            },
          },
        },
      },
    };
    expect(extractSplatUrl({}, statusData)).toBe('https://example.com/world_asset_splat.spz');
  });

  it('handles legacy worldData.splat_url path', () => {
    const worldData = { splat_url: 'https://example.com/legacy.spz' };
    expect(extractSplatUrl(worldData)).toBe('https://example.com/legacy.spz');
  });

  it('handles worldData.assets.splat_url path', () => {
    const worldData = { assets: { splat_url: 'https://example.com/asset_legacy.spz' } };
    expect(extractSplatUrl(worldData)).toBe('https://example.com/asset_legacy.spz');
  });
});

describe('extractColliderMeshUrl', () => {
  it('returns null for empty world data', () => {
    expect(extractColliderMeshUrl({})).toBeNull();
    expect(extractColliderMeshUrl(null)).toBeNull();
  });

  it('extracts from assets.meshes.glb_urls.collider', () => {
    const worldData = {
      assets: {
        meshes: {
          glb_urls: {
            collider: 'https://example.com/collider.glb',
          },
        },
      },
    };
    expect(extractColliderMeshUrl(worldData)).toBe('https://example.com/collider.glb');
  });

  it('falls back to assets.meshes.collider_glb_url', () => {
    const worldData = {
      assets: {
        meshes: {
          collider_glb_url: 'https://example.com/collider2.glb',
        },
      },
    };
    expect(extractColliderMeshUrl(worldData)).toBe('https://example.com/collider2.glb');
  });

  it('falls back to assets.collider_mesh.url', () => {
    const worldData = {
      assets: {
        collider_mesh: {
          url: 'https://example.com/collider3.glb',
        },
      },
    };
    expect(extractColliderMeshUrl(worldData)).toBe('https://example.com/collider3.glb');
  });

  it('falls back to collider_mesh.url on root', () => {
    const worldData = {
      collider_mesh: {
        url: 'https://example.com/collider4.glb',
      },
    };
    expect(extractColliderMeshUrl(worldData)).toBe('https://example.com/collider4.glb');
  });
});

describe('extractLowResSplatUrl', () => {
  it('returns null for empty world data', () => {
    expect(extractLowResSplatUrl({})).toBeNull();
  });

  it('prefers 500k over 100k', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            '500k': 'https://example.com/500k.spz',
            '100k': 'https://example.com/100k.spz',
          },
        },
      },
    };
    expect(extractLowResSplatUrl(worldData)).toBe('https://example.com/500k.spz');
  });

  it('falls back to 100k', () => {
    const worldData = {
      assets: {
        splats: {
          spz_urls: {
            '100k': 'https://example.com/100k.spz',
          },
        },
      },
    };
    expect(extractLowResSplatUrl(worldData)).toBe('https://example.com/100k.spz');
  });
});

describe('prepareMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_MARBLE_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_MARBLE_API_KEY;
    await expect(prepareMediaUpload('test.png')).rejects.toThrow('Marble API key not configured');
  });

  it('calls the correct endpoint with proper headers', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        media_asset: { id: 'asset123' },
        upload_info: {
          upload_url: 'https://upload.example.com',
          upload_method: 'PUT',
          required_headers: { 'x-custom': 'value' },
        },
      }),
    });

    const result = await prepareMediaUpload('test.png');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('media-assets:prepare_upload'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'WLT-Api-Key': 'test-key',
        }),
      })
    );
    expect(result.mediaAssetId).toBe('asset123');
    expect(result.uploadUrl).toBe('https://upload.example.com');
    expect(result.uploadMethod).toBe('PUT');
  });

  it('throws on non-ok response', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(prepareMediaUpload('test.png')).rejects.toThrow('Failed to prepare upload: 403');
  });
});

describe('generateWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_MARBLE_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_MARBLE_API_KEY;
    await expect(generateWorld('test', {})).rejects.toThrow('Marble API key not configured');
  });

  it('returns operation ID on success', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ operation_id: 'op_123' }),
    });

    const result = await generateWorld('My World', { type: 'image' });
    expect(result.operationId).toBe('op_123');
  });

  it('throws on API error', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    await expect(generateWorld('test', {})).rejects.toThrow('Marble API error: 500');
  });
});

describe('checkOperationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_MARBLE_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_MARBLE_API_KEY;
    await expect(checkOperationStatus('op_123')).rejects.toThrow('Marble API key not configured');
  });

  it('returns operation status data', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    const statusData = {
      done: true,
      metadata: { world_id: 'world_123' },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(statusData),
    });

    const result = await checkOperationStatus('op_123');
    expect(result).toEqual(statusData);
  });

  it('throws on failed status check', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(checkOperationStatus('op_123')).rejects.toThrow('Status check failed: 404');
  });
});

describe('fetchWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_MARBLE_API_KEY;
  });

  it('returns world data on success', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    const worldData = {
      id: 'world_123',
      assets: { splats: { spz_urls: { full_res: 'https://example.com/splat.spz' } } },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(worldData),
    });

    const result = await fetchWorld('world_123');
    expect(result).toEqual(worldData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('worlds/world_123'),
      expect.objectContaining({
        headers: { 'WLT-Api-Key': 'test-key' },
      })
    );
  });

  it('throws on fetch failure', async () => {
    process.env.VITE_MARBLE_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(fetchWorld('nonexistent')).rejects.toThrow('Failed to fetch world: 404');
  });
});

describe('uploadToSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads with correct method and headers', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const buffer = Buffer.from('fake image data');
    await uploadToSignedUrl(
      'https://upload.example.com',
      'PUT',
      { 'x-custom': 'header' },
      buffer,
      'image/png'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://upload.example.com',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-custom': 'header',
          'Content-Type': 'image/png',
        }),
        body: buffer,
      })
    );
  });

  it('throws on upload failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Access denied'),
    });

    await expect(
      uploadToSignedUrl('https://upload.example.com', 'PUT', {}, Buffer.from('data'), 'image/png')
    ).rejects.toThrow('Failed to upload file: 403');
  });
});

describe('API base URL', () => {
  it('points to correct WorldLabs API base', () => {
    expect(MARBLE_API_BASE).toBe('https://api.worldlabs.ai');
  });
});
