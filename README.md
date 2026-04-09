# flow

voice-guided 3D exploration. speak a concept, watch it become an immersive 3D world, then explore it in first-person while an AI narrator teaches you about what you're seeing.

**live at [flow.stephenhung.me](https://flow.stephenhung.me)**

## how it works

1. **speak or type a concept** -- "inside a black hole", "roman colosseum", "human cell"
2. **AI generates an image** -- gemini creates a cinematic scene from your prompt
3. **image becomes a 3D world** -- marble API converts the image into a gaussian splat
4. **explore in first-person** -- walk around the 3D environment with keyboard + mouse
5. **ask questions with your voice** -- press T to ask the AI narrator anything about the scene

the entire pipeline runs in real-time with websocket progress updates.

## features

- **voice input** -- speak your concept using deepgram speech-to-text
- **AI image generation** -- gemini 2.0 flash generates cinematic source images
- **3D gaussian splats** -- marble API (worldlabs) converts 2D images to explorable 3D worlds
- **first-person controls** -- WASD movement, mouse look, sprint, vertical movement
- **AI narration** -- educational content generated for each scene (learning objectives, key facts, sources)
- **voice Q&A** -- press T to ask questions; the AI sees your current view and responds with audio
- **scene library** -- save, browse, and share generated scenes
- **credit system** -- stripe-powered credits for generation ($0.99 - $44.99 packages)
- **real-time pipeline** -- socket.io streams generation progress to the frontend

## tech stack

| layer | tech |
|-------|------|
| frontend | react 19, vite, typescript, tailwind css 4, framer motion |
| 3D rendering | three.js, sparkjs (gaussian splat renderer) |
| shaders | custom GLSL (floating lines, cloud backgrounds, light pillars, accretion effects) |
| backend | express.js 5, socket.io |
| database | mongodb (atlas) |
| auth | firebase (client + admin SDK) |
| file storage | vercel blob |
| image generation | google gemini 2.0 flash |
| 3D generation | marble API (worldlabs) |
| speech-to-text | deepgram SDK + web speech API fallback |
| text-to-speech | elevenlabs + browser TTS fallback |
| payments | stripe (checkout sessions + webhooks) |
| deployment | railway (auto-deploy on push to main) |

## architecture

```
┌─────────────────────────────────────────────────┐
│                   frontend                       │
│  react + three.js + sparkjs + deepgram          │
│                                                  │
│  landing ──► explore ──► library ──► credits     │
│    │              │                              │
│    │ voice/text   │ 3D render                    │
│    ▼              ▼                              │
│  concept ──► generation pipeline                 │
└────────┬────────────────────────┬────────────────┘
         │ REST + WebSocket       │ deepgram
         ▼                        ▼
┌─────────────────────┐  ┌──────────────────┐
│      backend        │  │  deepgram cloud  │
│  express + socket.io│  │  (speech-to-text)│
│                     │  └──────────────────┘
│  pipeline:          │
│  1. orchestrate     │──► gemini (LLM)
│  2. generate image  │──► gemini (image gen)
│  3. create world    │──► marble API (3D)
│  4. store assets    │──► vercel blob
│  5. save scene      │──► mongodb
│                     │
│  narration:         │──► gemini (Q&A)
│  voice Q&A          │──► elevenlabs (TTS)
│                     │
│  payments:          │──► stripe
│  auth:              │──► firebase admin
└─────────────────────┘
```

## development

### prerequisites

- node.js 18+
- mongodb (local or atlas)
- API keys for: gemini, marble (worldlabs), deepgram, elevenlabs, firebase, stripe

### setup

```bash
# clone
git clone https://github.com/stephenhungg/flow.git
cd flow

# backend
cd backend
npm install
cp .env.example .env  # fill in your keys
npm run dev

# frontend (separate terminal)
cd frontend
npm install
cp .env.example .env  # fill in your keys
npm run dev
```

backend runs on `localhost:3001`, frontend on `localhost:5173`.

### environment variables

see `.env.example` files in both `backend/` and `frontend/` directories for required configuration.

## API endpoints

### auth
| method | endpoint | description |
|--------|----------|-------------|
| POST | `/api/auth/verify` | verify firebase token, create/sync user |
| GET | `/api/auth/me` | get current user profile |

### pipeline (3D generation)
| method | endpoint | description |
|--------|----------|-------------|
| POST | `/api/pipeline/start` | start generation (concept + optional image) |
| GET | `/api/pipeline/:jobId/status` | check pipeline job status |
| POST | `/api/pipeline/:jobId/cancel` | cancel job + refund credit |

### scenes
| method | endpoint | description |
|--------|----------|-------------|
| GET | `/api/scenes` | list public scenes (paginated) |
| GET | `/api/scenes/:id` | get scene details |
| POST | `/api/scenes` | create scene from uploaded splat |
| DELETE | `/api/scenes/:id` | delete scene (owner only) |
| GET | `/api/users/me/scenes` | get current user's scenes |

### credits
| method | endpoint | description |
|--------|----------|-------------|
| GET | `/api/credits/packages` | get available credit packages |
| POST | `/api/credits/create-checkout` | create stripe checkout session |
| POST | `/api/credits/webhook` | stripe webhook handler |

### other
| method | endpoint | description |
|--------|----------|-------------|
| POST | `/api/narration/ask` | voice Q&A (screenshot + question -> response + audio) |
| POST | `/api/marble/convert` | proxy to marble API for image -> 3D |
| GET | `/api/proxy/splat` | CORS proxy for splat file downloads |
| GET | `/s/:id` | short URL redirect to scene |
| GET | `/health` | health check |

## controls (in-scene)

| input | action |
|-------|--------|
| WASD | move |
| mouse | look around |
| shift | sprint (1.8x speed) |
| space | move up |
| ctrl | move down |
| T | hold to ask a voice question |
| ESC | release pointer lock |
| click | engage pointer lock |

## production

auto-deploys to railway on push to main. frontend builds with vite, backend runs express directly.

## rate limits

- general API: 100 requests / 15 min per IP
- auth endpoints: 5 attempts / 15 min per IP
- generation: 2 per hour per IP (admins bypass)

## credit packages

| credits | price |
|---------|-------|
| 1 | $0.99 |
| 5 | $4.99 |
| 10 | $9.99 |
| 20 | $18.99 |
| 50 | $44.99 |

each generation costs 1 credit. credits are deducted before generation starts and refunded if the pipeline fails.
