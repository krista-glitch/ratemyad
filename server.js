const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 8080;

// ── CORS ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── POST /analyze ─────────────────────────────────────────────────
app.post("/analyze", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file provided" });

  const filePath = req.file.path;
  const { awareness, funnel, adType, duration, width, height, size } = req.body;

  try {
    // Step 1: Upload to AssemblyAI
    console.log("Uploading to AssemblyAI...");
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fs.createReadStream(filePath),
      {
        headers: { authorization: ASSEMBLY_KEY, "content-type": "application/octet-stream" },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    const audioUrl = uploadRes.data.upload_url;
    console.log("Uploaded:", audioUrl);

    // Step 2: Transcribe
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: audioUrl, language_code: "en" },
      { headers: { authorization: ASSEMBLY_KEY, "content-type": "application/json" } }
    );
    const transcriptId = transcriptRes.data.id;
    console.log("Transcribing:", transcriptId);

    let transcript = "";
    while (true) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLY_KEY } }
      );
      console.log("Status:", poll.data.status);
      if (poll.data.status === "completed") { transcript = poll.data.text || ""; break; }
      if (poll.data.status === "error") throw new Error("AssemblyAI: " + poll.data.error);
    }
    console.log("Transcript:", transcript.slice(0, 100));

    // Step 3: Analyze with Claude
    const awarenessMap = {
      unaware: "Unaware — audience doesn't know they have the problem yet",
      problem_aware: "Problem Aware — they know the problem but not the solution",
      solution_aware: "Solution Aware — they know solutions exist but not this product",
      product_aware: "Product Aware — they know the product but aren't sold yet",
      most_aware: "Most Aware — they want it, just need a reason to buy now",
    };
    const funnelMap = { top: "Top of Funnel (cold)", middle: "Middle of Funnel (warm)", bottom: "Bottom of Funnel (hot)" };
    const adTypeMap = { direct: "Direct — Hook → Promise → Risk Reversal → Proof → CTA", indirect: "Indirect — Hook → Story → Free Resource → CTA" };
    const orient = width && height ? (parseInt(width) < parseInt(height) ? "Vertical 9:16 ✓" : "Landscape ⚠️") : "Unknown";

    const prompt = `You are an expert paid social media ad analyst for Meta and TikTok.

You have the verbatim transcript of a video ad. Analyze it deeply. Every piece of feedback must reference their actual words, hook line, offer, and CTA. Zero generic advice.

VIDEO DETAILS:
- Duration: ${duration}s
- Format: ${orient}
- File size: ${size}
- Audience awareness: ${awarenessMap[awareness] || "Not specified"}
- Funnel stage: ${funnelMap[funnel] || "Not specified"}
- Ad type: ${adTypeMap[adType] || "Not specified"}

TRANSCRIPT:
"""
${transcript}
"""

SCORING RULES (by weight):
1. Hook (first 3s) — HIGHEST. Pattern interrupt? Bold claim? Curiosity gap?
2. Completion/Pacing — HIGHEST. Every line earns its place? No filler?
3. Script structure — right formula for awareness level and ad type?
4. CTA — matched to funnel stage? Not in first 3 seconds?
5. Engagement design — saves, shares, comment triggers?
6. Visual direction — does the script suggest strong visuals?

AWARENESS RULES:
- Unaware: hook must CREATE the problem. Don't pitch yet.
- Problem Aware: call out the pain, explain why it keeps happening. Villain → Hero.
- Solution Aware: new mechanism. Old way vs new way. Product as hero.
- Product Aware: remove doubt only. Testimonials, objections, proof.
- Most Aware: push the offer. Urgency. Don't over-educate.

Return ONLY raw JSON — no markdown, no backticks:
{
  "score": <0-100>,
  "verdict": "<Strong Performer | Solid Ad | Needs Work | Low Potential>",
  "summary": "<2 sentences referencing their actual words and offer>",
  "hook_quote": "<their exact opening line from the transcript>",
  "hook_verdict": "<Strong | Needs Work | Weak>",
  "hook_rewrite": "<improved version using their actual product and offer — not generic>",
  "suggestions": [
    {
      "priority": "<high|med|low>",
      "tag": "<Hook | Script Structure | CTA | Proof | Pacing | Engagement | Visuals>",
      "issue": "<what is wrong — quote their actual words>",
      "fix": "<specific rewrite using their actual product, offer, or script>"
    }
  ],
  "signals": {
    "hook": <-18 to 18>,
    "watch": <-15 to 18>,
    "structure": <-10 to 10>,
    "cta": <-8 to 8>,
    "engagement": <-8 to 10>,
    "visuals": <-6 to 8>
  }
}

Give 3-4 suggestions. Every fix must use their actual words, product, or offer. Zero generic advice.`;

    console.log("Calling Claude...");
    const claudeRes = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        }
      }
    );

    const text = claudeRes.data.content.filter(b => b.type === "text").map(b => b.text).join("");
    console.log("Claude response:", text.slice(0, 100));
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse Claude response: " + text.slice(0, 200));
    const analysis = JSON.parse(match[0]);

    res.json({ transcript, analysis });

  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.listen(PORT, () => console.log(`RateMyAd backend on port ${PORT}`));
