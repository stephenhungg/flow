/**
 * Script to generate thumbnails for all scenes missing them
 * Run: node backend/scripts/generate-missing-thumbnails.js
 */

import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Upload file to Vultr Object Storage
 */
async function uploadFile(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read', // Make files publicly accessible
  });

  await s3Client.send(command);
  const url = `https://${BUCKET}.${process.env.VULTR_STORAGE_HOSTNAME}/${key}`;
  return url;
}

/**
 * Delete file from Vultr Object Storage
 */
async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await s3Client.send(command);
    console.log(`   🗑️  Deleted: ${key}`);
  } catch (error) {
    console.warn(`   ⚠️  Failed to delete ${key}:`, error.message);
  }
}

/**
 * Generate thumbnail for a scene
 */
async function generateThumbnail(scene, genAI) {
  console.log(`\n🎨 Generating thumbnail for: "${scene.title}" (${scene._id})`);
  console.log(`   Concept: ${scene.concept || scene.title}`);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

  const prompt = `Create a beautiful thumbnail image (4:3 aspect ratio) for a 3D educational scene about: ${scene.concept || scene.title}

STYLE:
- Bright, engaging, and educational
- Clear focal point that represents the concept
- Professional quality, suitable for a library thumbnail
- Vibrant colors, good contrast
- Clean composition

TECHNICAL:
- 4:3 aspect ratio (ideal for thumbnails)
- High quality, sharp details
- No text, no borders, no UI elements`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['image', 'text'],
    },
  });

  const response = await result.response;
  const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
  
  if (!imagePart?.inlineData) {
    throw new Error('No image data in Gemini response');
  }

  const imageData = imagePart.inlineData.data;
  const imageMimeType = imagePart.inlineData.mimeType || 'image/png';
  const imageBuffer = Buffer.from(imageData, 'base64');

  console.log(`   ✅ Generated: ${imageBuffer.length} bytes`);

  // Upload to Vultr
  const thumbnailKey = `scenes/${scene.creatorId}/${scene._id}/thumbnail.png`;
  const thumbnailUrl = await uploadFile(imageBuffer, thumbnailKey, imageMimeType);
  console.log(`   ✅ Uploaded: ${thumbnailUrl}`);

  return thumbnailUrl;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting thumbnail generation for missing scenes...\n');

  if (!MONGODB_URI || !GEMINI_API_KEY) {
    console.error('❌ Missing required environment variables (MONGODB_URI, VITE_GEMINI_API_KEY)');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('flow');
    const scenes = db.collection('scenes');

    // Find ALL scenes (we'll delete existing thumbnails and regenerate)
    const allScenes = await scenes.find({}).toArray();
    
    console.log(`📋 Found ${allScenes.length} total scenes`);
    console.log(`🗑️  Deleting existing thumbnails first...\n`);

    // Delete existing thumbnails from storage
    let deletedCount = 0;
    for (const scene of allScenes) {
      if (scene.thumbnailUrl) {
        try {
          // Extract key from URL (format: https://bucket.hostname/key)
          const url = scene.thumbnailUrl;
          if (url.includes('/scenes/')) {
            const keyIndex = url.indexOf('/scenes/');
            const key = url.substring(keyIndex + 1); // Remove leading slash
            await deleteFile(key);
            deletedCount++;
          }
        } catch (error) {
          console.warn(`   ⚠️  Could not extract key from URL: ${scene.thumbnailUrl}`);
        }
      }
    }
    console.log(`✅ Deleted ${deletedCount} existing thumbnails from storage\n`);

    // Clear thumbnail URLs in database
    await scenes.updateMany(
      { thumbnailUrl: { $exists: true, $ne: null } },
      { $set: { thumbnailUrl: null } }
    );
    console.log(`✅ Cleared thumbnail URLs in database\n`);

    // Now process all scenes to regenerate thumbnails
    const scenesToProcess = allScenes;

    let successCount = 0;
    let errorCount = 0;

    for (const scene of scenesToProcess) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Processing: "${scene.title}" (${scene._id})`);
      console.log(`Concept: ${scene.concept || scene.title}`);
      console.log(`${'='.repeat(60)}`);

      try {
        const thumbnailUrl = await generateThumbnail(scene, genAI);
        
        // Update scene in MongoDB
        await scenes.updateOne(
          { _id: scene._id },
          { 
            $set: { 
              thumbnailUrl,
              updatedAt: new Date() 
            } 
          }
        );

        console.log(`✅ Successfully updated scene with thumbnail`);
        successCount++;

        // Rate limiting - wait between requests (1 second)
        if (scenesToProcess.indexOf(scene) < scenesToProcess.length - 1) {
          console.log(`⏳ Waiting 1 second before next scene...\n`);
          await new Promise(r => setTimeout(r, 1000));
        }

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

