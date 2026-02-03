/**
 * Migration script: Vultr Object Storage → Vercel Blob Storage
 *
 * This script migrates all existing files from Vultr to Vercel Blob:
 * - Splat files (.spz)
 * - Thumbnails (PNG)
 * - Animated thumbnails (GIF)
 * - Collider mesh files (GLB)
 *
 * Run: node backend/scripts/migrate-to-vercel-blob.js [--dry-run] [--limit=10]
 */

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { uploadFile, listFiles } from '../server/lib/storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!MONGODB_URI) {
  console.error('❌ MongoDB URI not configured');
  process.exit(1);
}

if (!BLOB_READ_WRITE_TOKEN) {
  console.error('❌ Vercel Blob token not configured');
  process.exit(1);
}

/**
 * Extract the storage key from a Vultr URL
 * Example: https://flow-bucket.ewr1.vultrobjects.com/splats/user/scene.spz → splats/user/scene.spz
 */
function extractVultrKey(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Remove leading slash from pathname
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}

/**
 * Download file from Vultr URL
 */
async function downloadFromVultr(url) {
  if (!url) return null;

  try {
    console.log(`  📥 Downloading from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`  ⚠️ Failed to download (${response.status}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`  ✅ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    return buffer;
  } catch (error) {
    console.error(`  ❌ Download error: ${error.message}`);
    return null;
  }
}

/**
 * Migrate a single file from Vultr to Vercel Blob
 */
async function migrateFile(vultrUrl, key, contentType) {
  if (!vultrUrl) return null;

  // Download from Vultr
  const buffer = await downloadFromVultr(vultrUrl);
  if (!buffer) return null;

  // Upload to Vercel Blob
  try {
    console.log(`  📤 Uploading to Vercel Blob: ${key}`);
    const blobUrl = await uploadFile(buffer, key, contentType);
    console.log(`  ✅ Uploaded to: ${blobUrl}`);
    return blobUrl;
  } catch (error) {
    console.error(`  ❌ Upload error: ${error.message}`);
    return null;
  }
}

/**
 * Determine content type from URL/key
 */
function getContentType(url) {
  if (!url) return 'application/octet-stream';

  const ext = path.extname(url).toLowerCase();
  switch (ext) {
    case '.spz':
      return 'application/octet-stream';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.glb':
      return 'model/gltf-binary';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Migrate a scene's files
 */
async function migrateScene(scene, dryRun = false) {
  const sceneId = scene._id.toString();
  console.log(`\n📦 Processing scene: ${scene.title || 'Untitled'} (${sceneId})`);

  const updates = {};
  const migrations = [];

  // Prepare migration tasks
  if (scene.splatUrl && scene.splatUrl.includes('vultrobjects.com')) {
    const key = scene.splatKey || extractVultrKey(scene.splatUrl);
    if (key) {
      migrations.push({
        name: 'Splat file',
        vultrUrl: scene.splatUrl,
        key: key,
        contentType: 'application/octet-stream',
        updateField: 'splatUrl'
      });
    }
  }

  if (scene.thumbnailUrl && scene.thumbnailUrl.includes('vultrobjects.com')) {
    const key = extractVultrKey(scene.thumbnailUrl);
    if (key) {
      migrations.push({
        name: 'Thumbnail',
        vultrUrl: scene.thumbnailUrl,
        key: key,
        contentType: 'image/png',
        updateField: 'thumbnailUrl'
      });
    }
  }

  if (scene.animatedThumbnailUrl && scene.animatedThumbnailUrl.includes('vultrobjects.com')) {
    const key = extractVultrKey(scene.animatedThumbnailUrl);
    if (key) {
      migrations.push({
        name: 'Animated thumbnail',
        vultrUrl: scene.animatedThumbnailUrl,
        key: key,
        contentType: 'image/gif',
        updateField: 'animatedThumbnailUrl'
      });
    }
  }

  if (scene.colliderMeshUrl && scene.colliderMeshUrl.includes('vultrobjects.com')) {
    const key = extractVultrKey(scene.colliderMeshUrl);
    if (key) {
      migrations.push({
        name: 'Collider mesh',
        vultrUrl: scene.colliderMeshUrl,
        key: key,
        contentType: 'model/gltf-binary',
        updateField: 'colliderMeshUrl'
      });
    }
  }

  if (migrations.length === 0) {
    console.log(`  ✅ No Vultr files to migrate`);
    return { success: true, skipped: true };
  }

  if (dryRun) {
    console.log(`  🔍 DRY RUN - Would migrate ${migrations.length} files:`);
    migrations.forEach(m => console.log(`    - ${m.name}: ${m.key}`));
    return { success: true, dryRun: true };
  }

  // Perform migrations
  let successCount = 0;
  for (const migration of migrations) {
    console.log(`  🔄 Migrating ${migration.name}...`);
    const newUrl = await migrateFile(migration.vultrUrl, migration.key, migration.contentType);

    if (newUrl) {
      updates[migration.updateField] = newUrl;
      successCount++;
    } else {
      console.warn(`  ⚠️ Failed to migrate ${migration.name}`);
    }
  }

  return {
    success: successCount === migrations.length,
    updates,
    migrated: successCount,
    total: migrations.length
  };
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

  console.log('🚀 Starting Vultr → Vercel Blob migration');
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be migrated');
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

    // Find all scenes (or limited number)
    const query = {};
    const scenes = await scenesCollection
      .find(query)
      .limit(limit || 0)
      .toArray();

    console.log(`\n📊 Found ${scenes.length} scenes to check`);

    let successCount = 0;
    let partialCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let totalFilesMigrated = 0;

    for (const scene of scenes) {
      const result = await migrateScene(scene, dryRun);

      if (result.skipped) {
        skippedCount++;
      } else if (result.dryRun) {
        // Dry run, count as success
        successCount++;
      } else if (result.success) {
        // Update database with new URLs
        if (Object.keys(result.updates).length > 0) {
          await scenesCollection.updateOne(
            { _id: scene._id },
            {
              $set: {
                ...result.updates,
                updatedAt: new Date()
              }
            }
          );
          console.log(`  ✅ Database updated with ${Object.keys(result.updates).length} new URLs`);
        }

        successCount++;
        totalFilesMigrated += result.migrated;
      } else if (result.migrated > 0) {
        // Partial success
        if (Object.keys(result.updates).length > 0) {
          await scenesCollection.updateOne(
            { _id: scene._id },
            {
              $set: {
                ...result.updates,
                updatedAt: new Date()
              }
            }
          );
          console.log(`  ⚠️ Partial update: ${result.migrated}/${result.total} files migrated`);
        }

        partialCount++;
        totalFilesMigrated += result.migrated;
      } else {
        errorCount++;
      }

      // Add delay to avoid rate limiting
      if (!dryRun) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ Migration completed!`);
    console.log(`   - Scenes fully migrated: ${successCount}`);
    console.log(`   - Scenes partially migrated: ${partialCount}`);
    console.log(`   - Scenes with errors: ${errorCount}`);
    console.log(`   - Scenes skipped (no Vultr files): ${skippedCount}`);
    console.log(`   - Total files migrated: ${totalFilesMigrated}`);

    if (dryRun) {
      console.log(`\n📝 This was a DRY RUN. To perform the actual migration, run without --dry-run flag`);
    }

    // List current Vercel Blob files (optional verification)
    if (!dryRun) {
      console.log('\n📋 Verifying Vercel Blob Storage...');
      try {
        const blobs = await listFiles();
        console.log(`✅ Found ${blobs.length} files in Vercel Blob Storage`);

        // Show first few files as verification
        if (blobs.length > 0) {
          console.log('   Sample files:');
          blobs.slice(0, 5).forEach(blob => {
            console.log(`   - ${blob.pathname} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
          });
        }
      } catch (error) {
        console.warn('⚠️ Could not list Vercel Blob files:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await client.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
main().catch(console.error);