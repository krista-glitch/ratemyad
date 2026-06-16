const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 8080;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

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

    // Step 2: Transcribe
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: audioUrl, language_code: "en" },
      { headers: { authorization: ASSEMBLY_KEY, "content-type": "application/json" } }
    );
    const transcriptId = transcriptRes.data.id;

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

Analyze this video ad transcript and give clear, simple, direct feedback. Reference their actual words.

VIDEO DETAILS:
- Duration: ${duration}s
- Format: ${orient}
- Audience awareness: ${awarenessMap[awareness] || "Not specified"}
- Funnel stage: ${funnelMap[funnel] || "Not specified"}
- Ad type: ${adTypeMap[adType] || "Not specified"}

TRANSCRIPT:
"""
${transcript}
"""

Return ONLY raw JSON — no markdown, no backticks. Example format:
{
  "score": 72,
  "verdict": "Solid Ad",
  "summary": "The ad opens strong with a relatable pain point and uses a real customer voicemail as proof. However the CTA is too vague for a cold audience and the product reveal comes too late.",
  "improvements": [
    {
      "issue": "The CTA 'click our link to try for yourself' gives no reason to act now. Cold audiences need urgency or a guarantee to click.",
      "rewrite": "Try Basic Jane Pain Relief risk-free for 30 days — if you are not feeling less pain, we refund every penny. Click now."
    },
    {
      "issue": "The product name does not appear until 38 seconds in. By then 60% of viewers have already scrolled past.",
      "rewrite": null
    },
    {
      "issue": "The voicemail is read flatly with no visual support. The emotional peak of the ad has no image to anchor it.",
      "rewrite": null
    }
  ],
  "recommendations": [
    "Add a 3-second title card after the hook that names the product — something like 'Basic Jane Pain Relief' over the voicemail moment so viewers know what they are watching an ad for.",
    "Test a version where you open with the voicemail audio playing over a visual of someone walking pain-free — lead with the proof, then explain why it works.",
    "Add a risk reversal to the CTA. Your 30-day guarantee is your strongest closer — make it the last thing they hear before the link."
  ]
}

Now analyze the actual transcript above and return JSON in exactly this format. Use their real words, product name, and offer. Zero generic advice.`;

    console.log("Calling Claude...");
    const claudeRes = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
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
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse Claude response");
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
