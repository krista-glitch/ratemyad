# RateMyAd — Backend

Node.js/Express server that handles video transcription for RateMyAd.
Receives a video file, uploads it to AssemblyAI, polls for the transcript, and returns it to the frontend.

---

## How it works

```
Frontend (React)
    │
    │  POST /transcribe  (multipart video file)
    ▼
Backend (Node.js)
    │
    │  1. Upload file to AssemblyAI
    │  2. Submit transcription job
    │  3. Poll until complete
    │  4. Return transcript
    ▼
AssemblyAI API
```

---

## Local setup

### 1. Install dependencies

```bash
cd ratemyad-backend
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
ASSEMBLYAI_API_KEY=your_key_here
PORT=3001
```

### 3. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 4. Update the frontend

In `RateMyAd.jsx`, set:
```js
const BACKEND_URL = "http://localhost:3001";
```

---

## Deploy to Railway (recommended — free tier available)

Railway is the fastest way to deploy this backend.

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 2. Deploy
```bash
cd ratemyad-backend
railway init
railway up
```

### 3. Set environment variable in Railway dashboard
```
ASSEMBLYAI_API_KEY=93ba19785f30421298a55d04c695d914
```

### 4. Get your URL
Railway gives you a URL like `https://ratemyad-backend-production.up.railway.app`

Update `RateMyAd.jsx`:
```js
const BACKEND_URL = "https://ratemyad-backend-production.up.railway.app";
```

---

## Deploy to Render (also free tier)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create ratemyad-backend --public --push
```

### 2. Go to render.com
- New → Web Service
- Connect your GitHub repo
- Build command: `npm install`
- Start command: `npm start`
- Add env var: `ASSEMBLYAI_API_KEY`

### 3. Update frontend with your Render URL

---

## Deploy to Fly.io

```bash
npm install -g flyctl
fly auth login
fly launch
fly secrets set ASSEMBLYAI_API_KEY=93ba19785f30421298a55d04c695d914
fly deploy
```

---

## API Reference

### POST /transcribe

Upload a video file and get back a transcript.

**Request:**
```
Content-Type: multipart/form-data
Body: { video: <file> }
```

**Response:**
```json
{ "transcript": "Hey guys, today I want to show you..." }
```

**Error:**
```json
{ "error": "AssemblyAI error: audio file too short" }
```

---

## File size limits

- Default multer limit: no limit set (configure in server.js if needed)
- AssemblyAI free tier: 5 hours of audio total
- Recommended max video size: 500MB

To add a file size limit, update `server.js`:
```js
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});
```

---

## Security notes for production

1. **Lock down CORS** — replace `origin: "*"` with your actual frontend domain:
```js
app.use(cors({ origin: "https://yourdomain.com" }));
```

2. **Add rate limiting** to prevent abuse:
```bash
npm install express-rate-limit
```
```js
const rateLimit = require("express-rate-limit");
app.use("/transcribe", rateLimit({ windowMs: 60000, max: 10 }));
```

3. **Never expose your AssemblyAI key** in the frontend — always go through this backend.
