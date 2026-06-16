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
        "https://api.assemblyai.com/v2/transcript/" + transcriptId,
        { headers: { authorization: ASSEMBLY_KEY } }
      );
      console.log("Status:", poll.data.status);
      if (poll.data.status === "completed") { transcript = poll.data.text || ""; break; }
      if (poll.data.status === "error") throw new Error("AssemblyAI: " + poll.data.error);
    }
    console.log("Transcript:", transcript.slice(0, 100));

    // Step 3: Build prompt
    const awarenessMap = {
      unaware: "Unaware — audience does not know they have the problem yet",
      problem_aware: "Problem Aware — they know the problem but not the solution",
      solution_aware: "Solution Aware — they know solutions exist but not this product",
      product_aware: "Product Aware — they know the product but are not sold yet",
      most_aware: "Most Aware — they want it, just need a reason to buy now",
    };
    const funnelMap = {
      top: "Top of Funnel (cold)",
      middle: "Middle of Funnel (warm)",
      bottom: "Bottom of Funnel (hot)"
    };
    const adTypeMap = {
      direct: "Direct — Hook to Promise to Risk Reversal to Proof to CTA",
      indirect: "Indirect — Hook to Story to Free Resource to CTA"
    };
    const orient = width && height
      ? (parseInt(width) < parseInt(height) ? "Vertical 9:16" : "Landscape - should be vertical")
      : "Unknown";

    const prompt = "You are an expert paid social media ad analyst for Meta and TikTok, trained on the following ad scripting framework. Use this framework to evaluate every ad.\n\n"
      + "FRAMEWORK: HOW TO WRITE AD SCRIPTS THAT SELL\n"
      + "=============================================\n\n"
      + "MARKET AWARENESS LEVELS:\n"
      + "- Unaware: Hook must CREATE the problem. Use curiosity hooks, hidden problem reveals, shocking demos. Do not pitch the product yet.\n"
      + "- Problem Aware: Call out the pain. Explain why it keeps happening. Use villain/hero structure.\n"
      + "- Solution Aware: Introduce new mechanism. Use old way vs new way framing. Product as hero.\n"
      + "- Product Aware: Remove doubt only. Use testimonials, objection handling, FAQs. Do not re-explain the product.\n"
      + "- Most Aware: Push the offer. Urgency, discounts, bonuses, deadlines. Do NOT over-educate.\n\n"
      + "HOOK RULES:\n"
      + "- Strong hooks: stop the scroll, create curiosity, signal relevance, give a reason to keep watching.\n"
      + "- Weak: 'Our product exfoliates skin.' Strong: 'This came off my skin after one shower.'\n"
      + "- A CTA in the first 3 seconds KILLS retention. Never open with buy, click, or shop.\n"
      + "- Never open with a brand name or logo.\n\n"
      + "SCRIPT STRUCTURE:\n"
      + "- Direct: Hook to Promise to Risk Reversal to Proof to CTA\n"
      + "- Indirect: Hook to Story to Proof to Free Resource to CTA\n"
      + "- E-commerce: Curiosity Hook to Problem to Failed Current Solution to Product to Demo to Benefits to Proof to Offer to CTA\n"
      + "- Coaches: Hook to Relatable Story to Pain to Discovery to Proof to Free Resource or Offer to CTA\n\n"
      + "VILLAIN/HERO STRUCTURE:\n"
      + "- Name what has been failing them (the villain), then introduce the product as the hero.\n"
      + "- Example villain: 'Your cartridge razor clogs because the head is packed with plastic.' Hero: 'The Leaf Razor solves this with a cleaner metal design.'\n\n"
      + "PROOF:\n"
      + "- Add proof before or right after the CTA.\n"
      + "- Types: testimonials, customer results, reviews, demos, expert validation, social proof, comparison tests.\n\n"
      + "CTA RULES BY FUNNEL STAGE:\n"
      + "- Cold/Unaware: Soft CTA — 'Watch the free training', 'See how it works', 'Learn why this happens'\n"
      + "- Warm/Product Aware: Trust CTA — 'See customer results', 'Read the reviews'\n"
      + "- Hot/Most Aware: Purchase CTA — 'Get 33% off today', 'Order before the sale ends'\n"
      + "- NEVER use the same CTA for every audience.\n\n"
      + "RETENTION:\n"
      + "- Rehook throughout: 'But that is only half the problem', 'This is where most people mess up'\n"
      + "- Attention decays at every transition. Pull viewers forward.\n\n"
      + "OBJECTION HANDLING:\n"
      + "- Handle objections inside the script: price, efficacy, trust, time.\n"
      + "- Example: 'I know it is more expensive, but it pays for itself in refill savings.'\n\n"
      + "VISUAL DIRECTION:\n"
      + "- Every script line should suggest a visual.\n"
      + "- 'This helped 500 women' needs customer photos, not just words.\n\n"
      + "=============================================\n\n"
      + "VIDEO DETAILS:\n"
      + "- Duration: " + duration + "s\n"
      + "- Format: " + orient + "\n"
      + "- Audience awareness: " + (awarenessMap[awareness] || "Not specified") + "\n"
      + "- Funnel stage: " + (funnelMap[funnel] || "Not specified") + "\n"
      + "- Ad type: " + (adTypeMap[adType] || "Not specified") + "\n\n"
      + "TRANSCRIPT:\n\"\"\"\n" + transcript + "\n\"\"\"\n\n"
      + "Analyze this ad using the framework. Quote their actual words. Reference specific framework rules.\n\n"
      + "Return ONLY raw JSON, no markdown, no backticks:\n"
      + "{\n"
      + "  \"score\": 72,\n"
      + "  \"verdict\": \"Solid Ad\",\n"
      + "  \"summary\": \"2-3 sentences about what the ad does well and its biggest weakness. Reference their actual hook and offer.\",\n"
      + "  \"improvements\": [\n"
      + "    {\n"
      + "      \"issue\": \"Exactly what is wrong, quoting their words, referencing the framework rule being violated.\",\n"
      + "      \"rewrite\": \"A specific rewrite using their product and offer, or null if no rewrite is needed.\"\n"
      + "    },\n"
      + "    {\n"
      + "      \"issue\": \"Second issue.\",\n"
      + "      \"rewrite\": null\n"
      + "    },\n"
      + "    {\n"
      + "      \"issue\": \"Third issue.\",\n"
      + "      \"rewrite\": null\n"
      + "    }\n"
      + "  ],\n"
      + "  \"recommendations\": [\n"
      + "    \"First forward-looking recommendation specific to their product and script.\",\n"
      + "    \"Second recommendation.\",\n"
      + "    \"Third recommendation.\"\n"
      + "  ]\n"
      + "}\n\n"
      + "Rules: exactly 3 improvements, exactly 3 recommendations. Only include rewrite when a specific line change would help. Everything must reference their actual words and product. Zero generic advice.";

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
    console.log("Claude raw:", text.slice(0, 200));
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse Claude response: " + text.slice(0, 200));
    const analysis = JSON.parse(match[0]);

    res.json({ transcript, analysis });

  } catch (err) {
    console.error("Error:", err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ error: err.response ? (err.response.data.error && err.response.data.error.message) || err.message : err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.listen(PORT, () => console.log("RateMyAd backend on port " + PORT));
