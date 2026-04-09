# Flow - AI Context

## What This Is
Voice-guided 3D exploration platform. Users speak a concept, AI generates an image, image becomes a 3D gaussian splat world, users explore in first-person with AI narration.

Live at https://flow.stephenhung.me. Auto-deploys to Railway on push to main.

## Project Structure
```
flow/
├── backend/
│   ├── server.js          # monolithic express server (~2,900 lines)
│   └── server/lib/
│       ├── auth.js         # firebase token verification
│       ├── mongodb.js      # database helpers
│       ├── storage.js      # vercel blob operations
│       └── elevenlabs.js   # TTS integration
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # hash-based routing
│   │   ├── pages/          # LandingPage, ExplorePage, LibraryPage, CreditsPage
│   │   ├── components/     # ~5,300 lines total
│   │   │   ├── FirstPersonScene.tsx    # THREE.js 3D viewer (886 lines)
│   │   │   ├── EducationalScene.tsx    # pipeline orchestration (665 lines)
│   │   │   ├── GenerationLoadingScreen.tsx  # pipeline progress UI
│   │   │   ├── FloatingLines.tsx       # GLSL shader background
│   │   │   ├── CloudBackground.tsx     # GLSL cloud shader
│   │   │   └── LightPillar.tsx         # GLSL light effect
│   │   ├── hooks/          # usePipelineSocket, useNarration, useDeepgram, useFirstPersonControls
│   │   ├── contexts/       # AuthContext, ToastContext
│   │   └── lib/            # api.ts, firebase.ts, orchestrateConcept.ts, generateImage.ts, generateSplat.ts
│   └── public/
├── railway.json            # deployment config
└── package.json            # root workspace scripts
```

## Key Architecture Decisions
- **Monolithic backend**: All logic in server.js. Works fine at current scale but would need splitting if it grows.
- **Hash-based routing**: Frontend uses `/#explore`, `/#library`, etc. instead of proper routes.
- **WebSocket pipeline**: Socket.io streams real-time generation progress (stage, percentage, assets).
- **Credit system**: Credits deducted before generation, refunded on failure. Admins have unlimited credits (sent as "Infinity" string since JSON can't serialize Infinity).
- **Gaussian splats**: SparkJS renders 3D gaussian splats. Collider meshes from Marble API enable walking on geometry.
- **Dual TTS**: ElevenLabs primary, browser speech synthesis fallback.
- **Dual STT**: Deepgram primary, Web Speech API fallback.

## Build & Run
```bash
# backend
cd backend && npm install && npm run dev  # port 3001

# frontend
cd frontend && npm install && npm run dev  # port 5173
```

## External Services
- **Gemini**: Image generation + educational content orchestration + voice Q&A
- **Marble API (WorldLabs)**: Image → 3D gaussian splat conversion (polled every 5s, 10min timeout)
- **Deepgram**: Real-time speech-to-text via WebSocket
- **ElevenLabs**: Text-to-speech for narration
- **Firebase**: Authentication (client + admin SDK)
- **MongoDB Atlas**: User and scene data
- **Vercel Blob**: Splat files and thumbnail storage
- **Stripe**: Credit purchases (checkout sessions + webhooks)
- **Railway**: Backend hosting with auto-deploy

## Database Collections
- **users**: firebaseUid, email, displayName, credits, timestamps
- **scenes**: concept, splatUrl, colliderMeshUrl, worldId, orchestration (learningObjectives, keyFacts, narrationScript, subtitleLines, sources), tags, viewCount, isPublic

## Rate Limits
- General: 100 req / 15 min per IP
- Auth: 5 attempts / 15 min per IP
- Generation: 2 / hour per IP (admin bypass)

## Known Quirks
- Admin credits use Infinity which JSON can't serialize -- sent as string "Infinity", frontend converts back
- Marble API response structure varies -- multiple fallback paths for collider mesh URL
- Stripe webhook endpoint must be registered BEFORE express.json() middleware
- Frontend .env has VITE_ prefix requirement (vite convention)
- CORS allowlist: localhost:5173, localhost:3000, flow.stephenhung.me, *.vercel.app, *.railway.app
