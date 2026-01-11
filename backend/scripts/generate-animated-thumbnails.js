/**
 * Script to generate animated GIF thumbnails for existing scenes using Veo 3.1
 * Run: node backend/scripts/generate-animated-thumbnails.js
 */

import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { MongoClient, ObjectId } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

// Initialize Gemini client
const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Vultr S3 config
const s3Client = new S3Client({
  region: 'ewr1',
  endpoint: `https://${process.env.VULTR_STORAGE_HOSTNAME}`,
  credentials: {
    accessKeyId: process.env.VULTR_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.VULTR_STORAGE_SECRET_KEY,
  },
  forcePathStyle: false,
});

const BUCKET = process.env.VULTR_STORAGE_BUCKET;

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
    
    return Buffer.from(await videoResponse.arrayBuffer());
  } catch (error) {
    // If Veo isn't available, try a fallback approach using Imagen for animation effect
    console.warn(`⚠️ Veo API error: ${error.message}`);
    console.log(`🔄 Trying alternative approach...`);
    
    // For now, we'll create a simple animated effect from the static image
    // This is a fallback - in production you'd want full Veo access
    throw error;
  }
}

/**
 * Convert video to optimized GIF using FFmpeg
 */
async function convertToGif(videoBuffer) {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const tempVideoPath = path.join(tempDir, `${timestamp}.mp4`);
  const tempGifPath = path.join(tempDir, `${timestamp}.gif`);
  
  try {
    // Write video to temp file
    fs.writeFileSync(tempVideoPath, videoBuffer);
    
    // Convert to optimized GIF with palette generation for better colors
    // fps=12: 12 frames per second (smooth but not huge file)
    // scale=400:-1: 400px width, maintain aspect ratio
    // palettegen/paletteuse: generate optimal color palette for GIF
    // loop=0: infinite loop
    const ffmpegCmd = `ffmpeg -y -i "${tempVideoPath}" -vf "fps=12,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 "${tempGifPath}"`;
    
    console.log(`🔄 Converting to GIF...`);
    await execPromise(ffmpegCmd);
    
    // Read the GIF
    const gifBuffer = fs.readFileSync(tempGifPath);
    console.log(`✅ GIF created: ${(gifBuffer.length / 1024).toFixed(1)}KB`);
    
    return gifBuffer;
  } finally {
    // Cleanup temp files
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(tempGifPath)) fs.unlinkSync(tempGifPath);
  }
}

/**
 * Upload GIF to Vultr bucket
 */
async function uploadGif(gifBuffer, sceneId, creatorId) {
  const key = `scenes/${creatorId}/${sceneId}/preview.gif`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: gifBuffer,
    ContentType: 'image/gif',
    ACL: 'public-read',
  }));

  const url = `https://${BUCKET}.${process.env.VULTR_STORAGE_HOSTNAME}/${key}`;
  console.log(`✅ Uploaded GIF: ${url}`);
  return url;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting animated thumbnail generation...\n');

  if (!MONGODB_URI || !GEMINI_API_KEY) {
    console.error('❌ Missing required environment variables (MONGODB_URI, VITE_GEMINI_API_KEY)');
    process.exit(1);
  }

  // Check FFmpeg is installed
  try {
    await execPromise('ffmpeg -version');
    console.log('✅ FFmpeg found\n');
  } catch {
    console.error('❌ FFmpeg not found. Please install FFmpeg first.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('flow');
    const scenes = db.collection('scenes');

    // Find scenes with thumbnails but no animated thumbnails
    const scenesToProcess = await scenes.find({
      thumbnailUrl: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { animatedThumbnailUrl: null },
        { animatedThumbnailUrl: { $exists: false } },
        { animatedThumbnailUrl: '' }
      ]
    }).toArray();

    console.log(`📋 Found ${scenesToProcess.length} scenes needing animated thumbnails\n`);

    if (scenesToProcess.length === 0) {
      console.log('✨ All scenes already have animated thumbnails!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const scene of scenesToProcess) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: "${scene.title}" (${scene._id})`);
      console.log(`Concept: ${scene.concept}`);
      console.log(`Thumbnail: ${scene.thumbnailUrl}`);
      console.log(`${'='.repeat(60)}`);

      try {
        // Generate video from thumbnail
        const videoBuffer = await generateVideo(scene.thumbnailUrl, scene.concept);
        
        // Convert to GIF
        const gifBuffer = await convertToGif(videoBuffer);
        
        // Upload to Vultr
        const animatedThumbnailUrl = await uploadGif(
          gifBuffer,
          scene._id.toString(),
          scene.creatorId.toString()
        );

        // Update scene in MongoDB
        await scenes.updateOne(
          { _id: scene._id },
          { 
            $set: { 
              animatedThumbnailUrl,
              updatedAt: new Date() 
            } 
          }
        );

        console.log(`✅ Successfully updated scene with animated thumbnail`);
        successCount++;

        // Rate limiting - wait between requests
        console.log(`⏳ Waiting 5 seconds before next scene...`);
        await new Promise(r => setTimeout(r, 5000));

      } catch (err) {
        console.error(`❌ Error processing scene: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Successfully generated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`${'='.repeat(60)}\n`);

  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

main().catch(console.error);

