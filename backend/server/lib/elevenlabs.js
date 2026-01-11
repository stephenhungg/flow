import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel - calm, friendly

/**
 * Convert text to speech using ElevenLabs API
 * @param {string} text - Text to convert to speech
 * @returns {Promise<Buffer>} - Audio buffer (MP3)
 */
export async function textToSpeech(text) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY environment variable is required');
  }

  console.log('🔊 [ELEVENLABS] Converting to speech:', text.substring(0, 50) + '...');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [ELEVENLABS] Error:', response.status, errorText);
    throw new Error(`ElevenLabs error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log('✅ [ELEVENLABS] Audio generated:', buffer.length, 'bytes');
  
  return buffer;
}

/**
 * Get available voices from ElevenLabs
 * @returns {Promise<Array>} - List of available voices
 */
export async function getVoices() {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY environment variable is required');
  }

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  const data = await response.json();
  return data.voices;
}

