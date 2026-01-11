# Splat Library Guide

## Overview

Instead of generating splats on-the-fly (which can be slow and expensive), you can pre-generate a library of splats for common concepts and load them directly.

## Library Structure

Organize your splats in the `public/scenes/` directory:

```
public/
  scenes/
    ancient_rome.spz
    ancient_rome_high.spz
    photosynthesis.spz
    quantum_mechanics.spz
    butterfly.spz
    ...
```

## How It Works

1. **User says a concept** → "show me ancient rome"
2. **System checks library** → Looks for `ancient_rome.spz` in `public/scenes/`
3. **If found** → Loads directly (fast!)
4. **If not found** → Generates new splat via pipeline (slower)

## Pre-Generating Splats

### Option 1: Use Marble API to Pre-Generate

1. Generate images for your concepts using Gemini/Imagen
2. Convert each image to splat using Marble API
3. Download the `.spz` files
4. Place them in `public/scenes/`
5. Update `sceneRegistry.ts` with the file paths

### Option 2: Use @theworldlabs Tools

If you have access to @theworldlabs tools:
1. Use their web interface or CLI to convert images
2. Export as `.spz` files
3. Add to your library

### Option 3: Manual Generation

For hackathon demo:
1. Pre-generate splats for demo concepts
2. Store them in `public/scenes/`
3. The app will use them instantly

## Updating Scene Registry

Update `src/lib/sceneRegistry.ts`:

```typescript
export const sceneRegistry: SceneEntry[] = [
  {
    id: 'ancient_rome',
    title: 'Ancient Rome',
    splatLowUrl: '/scenes/ancient_rome.spz',  // Points to your library
    splatHighUrl: '/scenes/ancient_rome_high.spz',
    tags: ['rome', 'ancient', 'roman', 'empire']
  },
  // Add more scenes...
];
```

## Benefits of Library Approach

✅ **Faster loading** - No generation wait time
✅ **More reliable** - No API failures during demo
✅ **Cost effective** - Generate once, use many times
✅ **Better quality** - Can curate best results
✅ **Offline capable** - Works without API keys

## Current Behavior

The app now:
1. Checks library first (fast path)
2. Falls back to generation if not found
3. You can pre-populate library for hackathon demo

## For Hackathon Demo

**Recommended approach:**
1. Pre-generate 3-5 key concept splats
2. Place them in `public/scenes/`
3. Update scene registry
4. Demo will be fast and reliable!
