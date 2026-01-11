/**
 * Script to generate AI thumbnails for existing scenes without previews
 * Run: node backend/scripts/generate-thumbnails.js
 */

import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

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

async function generateImage(concept) {
  console.log(`🎨 Generating image for: "${concept}"`);
  
  const prompt = `Create a beautiful, dreamlike panoramic landscape image representing "${concept}". 
Style: Cinematic, photorealistic, ethereal lighting, rich colors, atmospheric depth.
The image should feel immersive and educational, like exploring a magical world.
Wide aspect ratio, no text, no people.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Find image in response
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  
  if (!imagePart?.inlineData?.data) {
    throw new Error('No image generated');
  }

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
}

async function uploadThumbnail(buffer, sceneId, creatorId) {
  const key = `scenes/${creatorId}/${sceneId}/thumbnail.png`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    ACL: 'public-read',
  }));

  const url = `https://${BUCKET}.${process.env.VULTR_STORAGE_HOSTNAME}/${key}`;
  console.log(`✅ Uploaded: ${url}`);
  return url;
}

async function main() {
  console.log('🚀 Starting thumbnail generation for existing scenes...\n');

  if (!MONGODB_URI || !GEMINI_API_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('flow');
    const scenes = db.collection('scenes');

    // Find scenes without thumbnails
    const scenesWithoutThumbnails = await scenes.find({
      $or: [
        { thumbnailUrl: null },
        { thumbnailUrl: { $exists: false } },
        { thumbnailUrl: '' }
      ]
    }).toArray();

    console.log(`📋 Found ${scenesWithoutThumbnails.length} scenes without thumbnails\n`);

    if (scenesWithoutThumbnails.length === 0) {
      console.log('✨ All scenes already have thumbnails!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const scene of scenesWithoutThumbnails) {
      console.log(`\n--- Processing: "${scene.title}" (${scene._id}) ---`);
      console.log(`   Concept: ${scene.concept}`);

      try {
        // Generate image with Gemini
        const { buffer } = await generateImage(scene.concept);
        
        // Upload to Vultr
        const thumbnailUrl = await uploadThumbnail(
          buffer,
          scene._id.toString(),
          scene.creatorId.toString()
        );

        // Update scene in MongoDB
        await scenes.updateOne(
          { _id: scene._id },
          { $set: { thumbnailUrl, updatedAt: new Date() } }
        );

        console.log(`✅ Updated scene with thumbnail`);
        successCount++;

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        console.error(`❌ Error processing scene: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n========================================`);
    console.log(`✅ Successfully generated: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`========================================\n`);

  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

main().catch(console.error);

