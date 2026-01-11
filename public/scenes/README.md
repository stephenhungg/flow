# Gaussian Splat Scenes

This directory stores your gaussian splat `.ply` files for the 3D viewer.

## Getting Sample Files

### Option 1: Download Demo Scenes (Quickest)
Download pre-made scenes from the GaussianSplats3D project:
```bash
curl -o gaussian_splat_data.zip https://projects.markkellogg.org/downloads/gaussian_splat_data.zip
unzip gaussian_splat_data.zip -d public/scenes/
```

This includes scenes for: Garden, Truck, Stump, and Bonsai.

### Option 2: Free Sample Files

**Hugging Face Dataset:**
- https://huggingface.co/datasets/Voxel51/gaussian_splatting
- Download pre-trained gaussian splat PLY files

**Steam Studio (CC0 License):**
- https://note.com/steam_studio/n/ne9736d94f162
- Free to use for testing, no restrictions

**Sketchfab:**
- https://sketchfab.com/
- Search for "gaussian splat" or "3D scan"
- Download free models

### Option 3: Generate Your Own (For Hackathon)

**Pipeline:**
1. Generate images with Midjourney/DALL-E/Stable Diffusion
2. Upload to LumaAI (https://lumalabs.ai/) or PolyCam
3. Wait 10-30 minutes for processing
4. Download the .ply file
5. Place in this directory

**Recommended Prompts:**
- "ancient roman forum, photorealistic, atmospheric"
- "inside a cell, mitochondria, microscopic view, scientific visualization"
- "solar system planets, cosmic space, stars"
- "coral reef underwater, tropical fish, sunlight rays"

## File Naming Convention

Use descriptive names:
- `ancient-rome.ply`
- `solar-system.ply`
- `cell-biology.ply`
- `ocean-reef.ply`

## Current Status

- [ ] test.ply - Placeholder (download a sample file)
- [ ] Add more scenes as you build your library

## File Size Notes

Gaussian splat files can be large (50-200MB). For hackathon:
- Aim for 3-5 scenes minimum
- Consider compressing with Draco if files are too large
- Test load times before deploying
