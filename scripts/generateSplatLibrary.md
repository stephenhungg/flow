# How to Build Your Splat Library

## Quick Start for Hackathon

### Option 1: Pre-Generate Splats (Recommended)

1. **Generate images** for your demo concepts using Gemini/Imagen
2. **Convert to splats** using Marble API or @theworldlabs tools
3. **Save .spz files** to `public/scenes/`
4. **Update scene registry** in `src/lib/sceneRegistry.ts`

### Option 2: Use Existing Splats

1. Download or obtain `.spz` files from:
   - @theworldlabs community
   - SparkJS examples
   - Other Gaussian Splat sources
2. Place them in `public/scenes/`
3. Update scene registry

### Option 3: Manual Script

Create a script to batch-generate splats:

```typescript
// scripts/generateLibrary.ts
import { generateImageWithGemini } from '../src/lib/generateImage';
import { convertImageToSplat } from '../src/lib/generateSplat';

const concepts = ['ancient rome', 'photosynthesis', 'quantum mechanics'];

for (const concept of concepts) {
  console.log(`Generating splat for: ${concept}`);
  const image = await generateImageWithGemini(concept);
  const splat = await convertImageToSplat(image);
  // Download and save to public/scenes/
}
```

## File Naming Convention

Use descriptive, consistent names:
- `ancient_rome.spz`
- `photosynthesis.spz`
- `quantum_mechanics.spz`

## Current Library Behavior

The app now:
1. ✅ Checks library first (instant load)
2. ✅ Falls back to generation if not found
3. ✅ You can mix pre-generated and on-the-fly splats

## For Demo

**Best approach:**
- Pre-generate 3-5 key concepts
- Place in `public/scenes/`
- Demo will be fast and reliable!
