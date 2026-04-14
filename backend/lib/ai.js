/**
 * AI service wrappers
 * Gemini (text generation, image generation, vision), Deepgram (STT), ElevenLabs (TTS)
 */

import fetch from 'node-fetch';
import { textToSpeech } from '../server/lib/elevenlabs.js';

function getGeminiApiKey() {
  return process.env.VITE_GEMINI_API_KEY;
}

/**
 * Generate text content with Gemini
 * @param {string} prompt - Text prompt
 * @param {string} [model] - Model name (default: gemini-2.0-flash-exp)
 * @returns {Promise<object>} Gemini API response
 */
export async function geminiGenerateText(prompt, model = 'gemini-2.0-flash-exp') {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Generate an image with Gemini (tries multiple models)
 * @param {string} prompt - Image generation prompt
 * @returns {Promise<object>} Gemini API response
 */
export async function geminiGenerateImage(prompt) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const models = ['gemini-3-pro-image-preview', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`🔄 [GEMINI] Trying model: ${model}`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [GEMINI] Image generation complete with', model);
        return data;
      } else {
        lastError = await response.text();
        console.warn(`⚠️ [GEMINI] ${model} failed:`, lastError);
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`⚠️ [GEMINI] ${model} error:`, e.message);
    }
  }

  throw new Error(lastError || 'All Gemini models failed');
}

/**
 * Generate image with Gemini using the image generation model
 * Returns the raw image buffer
 * @param {string} prompt - Image generation prompt
 * @returns {Promise<{buffer: Buffer, mimeType: string, base64: string}|null>}
 */
export async function geminiGenerateImageBuffer(prompt) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['image', 'text'],
    },
  });

  const response = await result.response;
  const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (!imagePart?.inlineData?.data) {
    return null;
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType || 'image/png',
    base64: imagePart.inlineData.data
  };
}

/**
 * Gemini Vision - analyze image with a question
 * @param {string} prompt - Text prompt/question
 * @param {string} imageBase64 - Base64-encoded image
 * @param {string} [mimeType] - Image MIME type
 * @returns {Promise<string>} Text response
 */
export async function geminiVision(prompt, imageBase64, mimeType = 'image/jpeg') {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ||
         "I'm not quite sure what I'm looking at. Could you ask me something else?";
}

// Re-export ElevenLabs TTS
export { textToSpeech };
