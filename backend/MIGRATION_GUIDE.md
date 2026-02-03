# Vultr → Vercel Blob Storage Migration Guide

## Overview
This guide covers the migration from Vultr Object Storage (S3-compatible) to Vercel Blob Storage for the Flow application.

## Prerequisites

1. **Create a Vercel Blob Store**
   - Go to https://vercel.com/dashboard/stores
   - Click "Create Store" → Choose "Blob"
   - Name it (e.g., "flow-storage")
   - Copy the Read/Write token

2. **Update Environment Variables**
   ```bash
   # Add to your .env file:
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
   ```

3. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

## Migration Steps

### Step 1: Test in Development (Recommended)

1. **Backup your database** (optional but recommended)
   ```bash
   mongodump --uri="your_mongodb_uri" --out=backup-$(date +%Y%m%d)
   ```

2. **Run a dry run first**
   ```bash
   cd backend
   node scripts/migrate-to-vercel-blob.js --dry-run --limit=5
   ```
   This shows what would be migrated without actually doing it.

3. **Migrate a few scenes for testing**
   ```bash
   node scripts/migrate-to-vercel-blob.js --limit=5
   ```

4. **Test functionality**
   - Upload a new scene
   - View existing scenes
   - Generate thumbnails
   - Delete a scene

### Step 2: Full Migration

1. **Run the full migration**
   ```bash
   node scripts/migrate-to-vercel-blob.js
   ```

   This will:
   - Download all files from Vultr
   - Upload them to Vercel Blob
   - Update database URLs
   - Show progress and statistics

2. **Monitor the migration**
   - The script shows progress for each scene
   - Files are migrated one by one
   - Database is updated after each successful migration
   - Built-in rate limiting prevents API throttling

### Step 3: Verify Migration

1. **Check Vercel Blob Storage**
   - Go to https://vercel.com/dashboard/stores
   - Click on your blob store
   - Verify files are present

2. **Test the application**
   ```bash
   cd backend
   npm run dev
   ```

   Test these operations:
   - [ ] View existing scenes (should load from Vercel Blob)
   - [ ] Upload new scene with splat file
   - [ ] Generate thumbnail for a scene
   - [ ] Delete a scene
   - [ ] Download splat files

3. **Run batch scripts**
   ```bash
   # Generate missing thumbnails
   node scripts/generate-missing-thumbnails.js --limit=2

   # Generate animated thumbnails (requires ffmpeg)
   node scripts/generate-animated-thumbnails.js --limit=2
   ```

### Step 4: Production Deployment

1. **Update production environment variables**
   - Add `BLOB_READ_WRITE_TOKEN` to your production environment
   - Remove old Vultr variables (after confirming everything works)

2. **Deploy the updated code**
   ```bash
   git add .
   git commit -m "feat: migrate storage from Vultr to Vercel Blob"
   git push
   ```

3. **Run migration on production**
   - SSH to your production server
   - Pull the latest code
   - Run the migration script
   - Monitor application logs

### Step 5: Cleanup (After Verification)

Once you've confirmed everything works:

1. **Remove Vultr credentials from .env**
   ```bash
   # Comment out or remove:
   # VULTR_STORAGE_HOSTNAME=...
   # VULTR_STORAGE_ACCESS_KEY=...
   # VULTR_STORAGE_SECRET_KEY=...
   # VULTR_STORAGE_BUCKET=...
   ```

2. **Delete files from Vultr** (optional)
   - Log into Vultr dashboard
   - Navigate to Object Storage
   - Delete the bucket or individual files

3. **Cancel Vultr subscription**
   - Cancel the Object Storage subscription to stop billing

## Testing Checklist

### Core Functionality
- [ ] **Upload Scene**: Create a new scene with splat file
- [ ] **View Scene**: Load and display existing scenes
- [ ] **Delete Scene**: Remove scene and its files
- [ ] **Generate Thumbnail**: Auto-generate missing thumbnails
- [ ] **Download Files**: Ensure splat files can be downloaded

### API Endpoints
Test these endpoints with a tool like Postman or curl:

1. **POST /api/scenes** - Upload new scene
   ```bash
   # Test with a sample .spz file
   curl -X POST http://localhost:3001/api/scenes \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "file=@sample.spz" \
     -F "title=Test Scene"
   ```

2. **GET /api/scenes** - List all scenes
   ```bash
   curl http://localhost:3001/api/scenes
   ```

3. **DELETE /api/scenes/:id** - Delete a scene
   ```bash
   curl -X DELETE http://localhost:3001/api/scenes/SCENE_ID \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **POST /api/scenes/:id/generate-thumbnail** - Generate thumbnail
   ```bash
   curl -X POST http://localhost:3001/api/scenes/SCENE_ID/generate-thumbnail \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### Batch Scripts
- [ ] `generate-missing-thumbnails.js` - Creates thumbnails for scenes
- [ ] `generate-animated-thumbnails.js` - Creates animated GIFs
- [ ] `migrate-to-vercel-blob.js` - Migration script works

## Troubleshooting

### Common Issues

1. **"Vercel Blob Storage token not configured"**
   - Ensure `BLOB_READ_WRITE_TOKEN` is set in .env
   - Token should start with `vercel_blob_rw_`

2. **Upload fails with 413 (Payload Too Large)**
   - Vercel Blob supports up to 500MB per file
   - Your splat files should be under 100MB (current limit)

3. **Migration script fails**
   - Check network connection
   - Verify Vultr files are still accessible
   - Run with `--limit=1` to debug single scene

4. **CORS issues**
   - Vercel Blob URLs are public by default
   - The proxy endpoint has been updated for Vercel URLs

### Rollback Plan

If you need to rollback:

1. **Keep Vultr credentials** in your .env (commented out)
2. **Database has both URLs** during migration
3. **Revert the code** if needed:
   ```bash
   git revert HEAD
   npm install
   ```

## Cost Comparison

### Vultr Object Storage
- Base: $5/month for 250GB
- Bandwidth: $0.01/GB after 1TB

### Vercel Blob Storage
- Included in Pro plan: 1GB-10GB storage
- Additional: $0.20/GB/month
- Bandwidth: Included with Vercel plan

**For <5GB storage and <100GB bandwidth**: Vercel Blob is more cost-effective when already using Vercel for hosting.

## Support

If you encounter issues:
1. Check the migration script output for specific errors
2. Verify all environment variables are set
3. Test with a single file using `--limit=1`
4. Check Vercel Blob dashboard for storage usage

## Summary

The migration from Vultr to Vercel Blob Storage:
- ✅ Reduces operational complexity (one less service)
- ✅ Integrates with Vercel's CDN
- ✅ Simplifies deployment and configuration
- ✅ Maintains backward compatibility during migration
- ✅ Includes comprehensive testing and rollback options

Remember to test thoroughly in development before running the migration in production!