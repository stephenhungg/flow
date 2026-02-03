/**
 * Script to generate thumbnails for all scenes missing them
 * Run: node backend/scripts/generate-missing-thumbnails.js
 */

import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { uploadFile, deleteFile, extractKeyFromUrl } from '../server/lib/storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

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

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Generate thumbnail for a scene
 */
async function generateThumbnail(scene, forceRegenerate = false) {
  const sceneId = scene._id.toString();
  console.log(`\n🎨 Processing scene: ${scene.title} (${sceneId})`);

  // Skip if thumbnail already exists (unless force regenerate)
  if (scene.thumbnailUrl && !forceRegenerate) {
    console.log(`✅ Thumbnail already exists`);
    return null;
  }

  // If regenerating, delete the old thumbnail
  if (scene.thumbnailUrl && forceRegenerate) {
    console.log(`🗑️ Deleting old thumbnail...`);
    try {
      // Extract the key from the URL if needed
      const keyToDelete = extractKeyFromUrl(scene.thumbnailUrl);
      await deleteFile(keyToDelete);
      console.log(`✅ Old thumbnail deleted`);
    } catch (error) {
      console.warn(`⚠️ Could not delete old thumbnail: ${error.message}`);
    }
  }

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

  try {
    console.log(`🎨 Generating thumbnail...`);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      },
    });
    const response = await result.response;

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imagePart?.inlineData) {
      const imageData = imagePart.inlineData.data;
      const imageMimeType = imagePart.inlineData.mimeType || 'image/png';
      const imageBuffer = Buffer.from(imageData, 'base64');

      const userId = scene.userId;
      const thumbnailKey = `scenes/${userId}/${sceneId}/thumbnail.png`;
      const thumbnailUrl = await uploadFile(imageBuffer, thumbnailKey, imageMimeType);

      console.log(`✅ Thumbnail generated and uploaded: ${thumbnailUrl}`);
      return thumbnailUrl;
    } else {
      console.error(`❌ No image generated for scene ${sceneId}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error generating thumbnail for scene ${sceneId}:`, error.message);
    return null;
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const forceRegenerate = args.includes('--force');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

  console.log('🚀 Starting thumbnail generation script');
  if (forceRegenerate) {
    console.log('⚠️ Force regenerate mode - will replace existing thumbnails');
  }
  if (limit) {
    console.log(`📊 Processing limit: ${limit} scenes`);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('flow');
    const scenesCollection = db.collection('scenes');

    // Find scenes based on whether we're regenerating or not
    const query = forceRegenerate ? {} : { thumbnailUrl: { $in: [null, '', undefined] } };
    const scenes = await scenesCollection
      .find(query)
      .limit(limit || 0)
      .toArray();

    console.log(`\n📊 Found ${scenes.length} scenes to process`);

    let successCount = 0;
    let errorCount = 0;

    for (const scene of scenes) {
      const thumbnailUrl = await generateThumbnail(scene, forceRegenerate);

      if (thumbnailUrl) {
        // Update the scene with the new thumbnail
        await scenesCollection.updateOne(
          { _id: scene._id },
          {
            $set: {
              thumbnailUrl,
              updatedAt: new Date()
            }
          }
        );
        successCount++;
      } else if (!scene.thumbnailUrl || forceRegenerate) {
        // Only count as error if we tried to generate (not if it already had one)
        errorCount++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n✅ Completed!`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Skipped: ${scenes.length - successCount - errorCount}`);

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
main().catch(console.error);