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

    const prompt = `You are an expert paid social media ad analyst for Meta and TikTok, trained on the following ad scripting framework. Use this framework — not generic advice — to evaluate every ad.

FRAMEWORK: HOW TO WRITE AD SCRIPTS THAT SELL
=============================================

MARKET AWARENESS LEVELS:
- Unaware: Hook must CREATE the problem. Use curiosity hooks, hidden problem reveals, shocking demos. Don't pitch the product yet.
- Problem Aware: Call out the pain. Explain why it keeps happening. Use villain/hero structure: name what's failing them, introduce product as hero.
- Solution Aware: Introduce new mechanism. Use "old way vs new way" framing. Product-as-hero scripts.
- Product Aware: Remove doubt only. Use testimonials, objection handling, FAQs. Don't re-explain the product.
- Most Aware: Push the offer. Urgency, discounts, bonuses, deadlines. Do NOT over-educate.

HOOK RULES:
- The hook has one job: make the right person stop and want to know what happens next.
- Strong hooks: stop the scroll, create curiosity, signal relevance, give a reason to keep watching.
- Weak: "Our shower towel exfoliates skin." Strong: "This came off my skin after one shower."
- Weak: "Lose weight with our program." Strong: "I used to think I had a slow metabolism. Turns out I was doing everything wrong."
- A CTA in the first 3 seconds KILLS retention. Never open with "buy", "click", or "shop".
- Never open with a brand name or logo.

SCRIPT STRUCTURE BY AD TYPE:
- Direct (sells directly): Hook → Promise → Risk Reversal → Proof → CTA
- Indirect (promotes free resource): Hook → Story → Proof → Free Resource → CTA
- E-commerce: Curiosity Hook → Problem → Failed Current Solution → Product as New Solution → Demo → Benefits → Proof → Offer → CTA
- Coaches/personal brands: Hook → Relatable Story → Pain → Discovery/New Method → Proof → Free Resource or Offer → CTA
- Sophisticated markets: Shared Frustration → Why Old Solutions Fail → New Mechanism → Proof → Product → CTA

MAKING THE PROBLEM FEEL REAL:
- After the hook, make the viewer think "that's exactly what I'm dealing with."
- Use: relatable story, specific pain point, failed solution, hidden cause, villain structure.
- Villain structure: "Your cartridge razor clogs because..." then hero: "The Leaf Razor solves this with..."

PROOF:
- Add proof before or right after the CTA.
- Proof types: testimonials, customer results, reviews, demos, expert validation, social proof, comparison tests.
- Proof turns interest into belief.

CTA RULES BY FUNNEL STAGE:
- Cold/Unaware: Soft CTA — "Watch the free training", "See how it works", "Learn why this happens"
- Warm/Product Aware: Trust CTA — "See customer results", "Read the reviews", "Watch the comparison"
- Hot/Most Aware: Purchase CTA — "Get 33% off today", "Order before the sale ends", "Claim your free gift"
- The more aware the audience, the more direct the CTA can be.
- NEVER use the same CTA for every audience.

RETENTION:
- Rehook throughout: "But that's only half the problem", "This is where most people mess up", "The next part is why this actually works"
- Attention decays — every transition should pull the viewer into the next section.
- Put your second-best point first, best point second, third-best third — creates feeling of increasing value.

OBJECTION HANDLING:
- Strong scripts anticipate objections and handle them inside the script.
- Common: "Is it too expensive?", "Will it work for me?", "Is this different from what I already tried?", "How long does it take?"
- Example: "I know it's more expensive, but it pays for itself in refill savings."

VISUAL DIRECTION:
- Every script line should suggest a visual.
- "I used to think I had a slow metabolism" → person stepping on scale, looking frustrated.
- "This helped 500 women" → customer photos, review screenshots, happy after-state.

MARKET SOPHISTICATION (when to use which approach):
- Stage 1 — Basic claim: "How to lose weight." Only works if market is new.
- Stage 2 — Exaggerated claim: "Lose 20 pounds in 90 days without starving."
- Stage 3 — New mechanism: "Why most weight loss plans fail women over 40 — and the hormone-first method that fixes it."
- Stage 4 — Better mechanism: "The 3-step hormone reset that helps women over 40 lose weight without cutting carbs."
- Stage 5 — Shared identity: "Nobody tells you how frustrating it feels when your body stops responding to everything that used to work."

=============================================

Now analyze this specific video ad using the framework above.

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

Use the framework above to identify exactly what this ad does right and what it violates. Quote their actual words. Reference specific framework rules.

Return ONLY raw JSON — no markdown, no backticks. Example format:
{
  "score": 72,
  "verdict": "Solid Ad",
  "summary": "The ad opens strong with a relatable pain point and uses a real customer voicemail as proof. However the CTA is too vague for a cold audience and the product reveal comes too late.",
  "improvements": [
    {
      "issue": "The CTA 'click our link to try for yourself' gives no reason to act now. For a cold/unaware audience, the framework calls for a soft CTA like 'See how it works' or 'Learn why this happens' — not a direct purchase push.",
      "rewrite": "Try Basic Jane Pain Relief risk-free for 30 days — if you are not feeling less pain, we refund every penny. Click now."
    },
    {
      "issue": "The product name does not appear until 38 seconds in. By then 60% of viewers have already scrolled. The framework says proof and product should come right after the problem is established — not at the end.",
      "rewrite": null
    },
    {
      "issue": "There is no rehook after the voicemail. Attention drops at transitions. The framework requires a line like 'And here is the part nobody talks about' to pull viewers into the next section.",
      "rewrite": null
    }
  ],
  "recommendations": [
    "Add a risk reversal before the CTA. The framework says direct ads need: Hook → Promise → Risk Reversal → Proof → CTA. Your guarantee is your strongest closer — make it the last thing they hear.",
    "Test a version that opens with the voicemail audio playing over a visual of someone walking pain-free. Lead with the proof, then explain why it works — this follows the Problem Aware structure more tightly.",
    "Add a villain line after the hook. The framework calls for naming what has been failing them: 'Most pain creams just mask the surface. Basic Jane goes deeper because it was designed by a nurse, not a marketing team.'"
  ]
}

Now analyze the actual transcript above and return JSON in exactly this format. Reference specific framework rules in your feedback. Use their real words, product name, and offer. Zero generic advice.\`;"path");

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
