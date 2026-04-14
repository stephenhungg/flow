/**
 * Tests for lib/ai.js
 * Gemini wrappers: text generation, image generation, vision, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so the variable is available when vi.mock factories run (hoisted)
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('node-fetch', () => ({
  default: mockFetch,
}));

// Mock elevenlabs
vi.mock('../server/lib/elevenlabs.js', () => ({
  textToSpeech: vi.fn().mockResolvedValue(Buffer.from('audio')),
}));

// Mock @google/generative-ai
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    data: 'base64imagedata',
                    mimeType: 'image/png',
                  },
                }],
              },
            }],
          },
        }),
      };
    }
  },
}));

import {
  geminiGenerateText,
  geminiGenerateImage,
  geminiGenerateImageBuffer,
  geminiVision,
  textToSpeech,
} from '../lib/ai.js';

describe('geminiGenerateText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_GEMINI_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_GEMINI_API_KEY;
    await expect(geminiGenerateText('hello')).rejects.toThrow('Gemini API key not configured');
  });

  it('calls Gemini API with correct model and prompt', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'Generated text' }] } }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await geminiGenerateText('Write about forests');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash-exp:generateContent'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Write about forests'),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it('uses custom model when specified', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await geminiGenerateText('hello', 'gemini-1.5-flash');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-1.5-flash:generateContent'),
      expect.any(Object)
    );
  });

  it('throws on API error with status code', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    await expect(geminiGenerateText('hello')).rejects.toThrow('Gemini API error: 429');
  });

  it('includes API key in URL', async () => {
    process.env.VITE_GEMINI_API_KEY = 'my-secret-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await geminiGenerateText('hello');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('key=my-secret-key'),
      expect.any(Object)
    );
  });
});

describe('geminiGenerateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_GEMINI_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_GEMINI_API_KEY;
    await expect(geminiGenerateImage('a cat')).rejects.toThrow('Gemini API key not configured');
  });

  it('tries multiple models and returns first success', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    // First model fails, second succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Not found') })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'image' }),
      });

    const result = await geminiGenerateImage('a cat');
    expect(result).toEqual({ data: 'image' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when all models fail', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Error 1') })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Error 2') })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Error 3') });

    await expect(geminiGenerateImage('a cat')).rejects.toThrow('Error 3');
  });

  it('handles network errors in model fallback', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' }),
      });

    const result = await geminiGenerateImage('a cat');
    expect(result).toEqual({ data: 'success' });
  });
});

describe('geminiGenerateImageBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_GEMINI_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_GEMINI_API_KEY;
    await expect(geminiGenerateImageBuffer('a cat')).rejects.toThrow('Gemini API key not configured');
  });

  it('returns buffer, mimeType, and base64 on success', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    const result = await geminiGenerateImageBuffer('a cat');

    expect(result).not.toBeNull();
    expect(result.base64).toBe('base64imagedata');
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });
});

describe('geminiVision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.VITE_GEMINI_API_KEY;
  });

  it('throws when API key is not configured', async () => {
    delete process.env.VITE_GEMINI_API_KEY;
    await expect(geminiVision('describe this', 'base64')).rejects.toThrow('Gemini API key not configured');
  });

  it('sends image data with correct MIME type', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'I see a cat' }] } }],
      }),
    });

    const result = await geminiVision('What is this?', 'base64data', 'image/png');

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect(body.contents[0].parts[1].inline_data.data).toBe('base64data');
    expect(result).toBe('I see a cat');
  });

  it('returns fallback text when no candidates', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    });

    const result = await geminiVision('What is this?', 'base64data');
    expect(result).toContain("not quite sure");
  });

  it('throws on API error', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    await expect(geminiVision('describe', 'base64')).rejects.toThrow('Gemini Vision API error: 500');
  });

  it('uses default MIME type of image/jpeg', async () => {
    process.env.VITE_GEMINI_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'response' }] } }],
      }),
    });

    await geminiVision('describe this', 'base64data');

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
  });
});

describe('textToSpeech re-export', () => {
  it('is a function', () => {
    expect(typeof textToSpeech).toBe('function');
  });
});
