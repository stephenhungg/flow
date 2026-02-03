/**
 * Script to generate animated GIF thumbnails for existing scenes using Veo 3.1
 * Run: node backend/scripts/generate-animated-thumbnails.js
 */

import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { MongoClient, ObjectId } from 'mongodb';
import { uploadFile } from '../server/lib/storage.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

if (!MONGODB_URI || !GEMINI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Initialize Gemini client
const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Generate video from image using Veo 3.1
 */
async function generateVideo(thumbnailUrl, concept) {
  console.log(`🎬 Generating video for: "${concept}"`);

  // Download the thumbnail image first
  const imageResponse = await fetch(thumbnailUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download thumbnail: ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const imageBase64 = imageBuffer.toString('base64');

  const prompt = `Gentle cinematic camera movement through ${concept}. Subtle parallax effect, atmospheric lighting, dreamlike quality. Slow smooth motion, no sudden changes.`;

  try {
    // Use Veo 3.1 for image-to-video generation
    let operation = await genai.models.generateVideos({
      model: "veo-3.0-generate-preview",
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/png'
      },
      config: {
        aspectRatio: "16:9",
        durationSeconds: 4,
      }
    });

    console.log(`⏳ Video generation started, polling for completion...`);

    // Poll until complete
    while (!operation.done) {
      await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds between polls
      console.log(`   Still processing...`);
      operation = await genai.operations.get({ name: operation.name });
    }

    if (operation.error) {
      throw new Error(`Video generation failed: ${operation.error.message}`);
    }

    // Get the video URL from response
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
      throw new Error('No video URI in response');
    }

    console.log(`✅ Video generated: ${videoUri}`);

    // Download the video
    const videoResponse = await fetch(videoUri);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    return videoBuffer;

  } catch (error) {
    console.error(`❌ Video generation error: ${error.message}`);
    throw error;
  }
}

/**
 * Convert video to GIF using ffmpeg
 */
async function convertToGif(videoBuffer) {
  const tempDir = os.tmpdir();
  const videoPath = path.join(tempDir, `video-${Date.now()}.mp4`);
  const gifPath = path.join(tempDir, `gif-${Date.now()}.gif`);

  try {
    // Write video to temp file
    await fs.promises.writeFile(videoPath, videoBuffer);

    // Convert to GIF using ffmpeg (high quality, optimized for web)
    const ffmpegCmd = `ffmpeg -i ${videoPath} -vf "fps=15,scale=512:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ${gifPath}`;

    console.log('🎞️ Converting video to GIF...');
    await execPromise(ffmpegCmd);

    // Read the GIF file
    const gifBuffer = await fs.promises.readFile(gifPath);

    // Clean up temp files
    await fs.promises.unlink(videoPath).catch(() => {});
    await fs.promises.unlink(gifPath).catch(() => {});

    return gifBuffer;
  } catch (error) {
    // Clean up on error
    await fs.promises.unlink(videoPath).catch(() => {});
    await fs.promises.unlink(gifPath).catch(() => {});
    throw error;
  }
}

/**
 * Upload animated thumbnail to Vercel Blob
 */
async function uploadAnimatedThumbnail(gifBuffer, userId, sceneId) {
  const key = `scenes/${userId}/${sceneId}/animated-thumbnail.gif`;
  const url = await uploadFile(gifBuffer, key, 'image/gif');
  console.log(`✅ Animated thumbnail uploaded to Vercel Blob: ${url}`);
  return url;
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  const skipExisting = args.includes('--skip-existing');

  console.log('🚀 Starting animated thumbnail generation script');
  if (limit) {
    console.log(`📊 Processing limit: ${limit} scenes`);
  }
  if (skipExisting) {
    console.log('⏭️ Skipping scenes with existing animated thumbnails');
  }

  // Check if ffmpeg is available
  try {
    await execPromise('ffmpeg -version');
    console.log('✅ ffmpeg is available');
  } catch (error) {
    console.error('❌ ffmpeg is not installed. Please install ffmpeg to use this script.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('flow');
    const scenesCollection = db.collection('scenes');

    // Find scenes with thumbnails but no animated thumbnails (or all if not skipping)
    const query = {
      thumbnailUrl: { $exists: true, $ne: null, $ne: '' }
    };

    if (skipExisting) {
      query.animatedThumbnailUrl = { $in: [null, '', undefined] };
    }

    const scenes = await scenesCollection
      .find(query)
      .limit(limit || 0)
      .toArray();

    console.log(`\n📊 Found ${scenes.length} scenes to process`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const scene of scenes) {
      const sceneId = scene._id.toString();
      console.log(`\n🎨 Processing scene: ${scene.title} (${sceneId})`);

      // Skip if animated thumbnail already exists and we're skipping
      if (scene.animatedThumbnailUrl && skipExisting) {
        console.log(`✅ Animated thumbnail already exists, skipping`);
        skippedCount++;
        continue;
      }

      try {
        // Generate video from thumbnail
        const videoBuffer = await generateVideo(scene.thumbnailUrl, scene.concept || scene.title);

        // Convert to GIF
        const gifBuffer = await convertToGif(videoBuffer);

        // Upload to Vercel Blob
        const animatedUrl = await uploadAnimatedThumbnail(gifBuffer, scene.userId, sceneId);

        // Update scene with animated thumbnail URL
        await scenesCollection.updateOne(
          { _id: scene._id },
          {
            $set: {
              animatedThumbnailUrl: animatedUrl,
              updatedAt: new Date()
            }
          }
        );

        successCount++;
        console.log(`✅ Successfully created animated thumbnail`);

      } catch (error) {
        console.error(`❌ Error processing scene ${sceneId}: ${error.message}`);
        errorCount++;
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Completed!`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Skipped: ${skippedCount}`);

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
main().catch(console.error);