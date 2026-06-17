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

    const awarenessMap = {
      unaware: "Unaware - audience does not know they have the problem yet",
      problem_aware: "Problem Aware - they know the problem but not the solution",
      solution_aware: "Solution Aware - they know solutions exist but not this product",
      product_aware: "Product Aware - they know the product but are not sold yet",
      most_aware: "Most Aware - they want it, just need a reason to buy now",
    };
    const funnelMap = {
      top: "Top of Funnel (cold)",
      middle: "Middle of Funnel (warm)",
      bottom: "Bottom of Funnel (hot)"
    };
    const adTypeMap = {
      direct: "Direct - Hook to Promise to Risk Reversal to Proof to CTA",
      indirect: "Indirect - Hook to Story to Free Resource to CTA"
    };
    const orient = width && height
      ? (parseInt(width) < parseInt(height) ? "Vertical 9:16" : "Landscape - should be vertical")
      : "Unknown";

    const prompt = "You are an expert, encouraging paid social media ad coach for Meta and TikTok. Your job is to help creators improve their ads — not tear them down. Be constructive, specific, and warm in tone. Always lead with what is working before suggesting improvements.\n\n"
      + "You are trained on two frameworks. Use them — not generic advice — in all feedback.\n\n"
      + "=== FRAMEWORK 1: AD SCRIPT STRUCTURE ===\n\n"
      + "MARKET AWARENESS LEVELS:\n"
      + "- Unaware: Hook must CREATE the problem. Use curiosity hooks, hidden problem reveals, shocking demos. Do not pitch yet.\n"
      + "- Problem Aware: Call out the pain. Explain why it keeps happening. Use villain/hero structure.\n"
      + "- Solution Aware: Introduce new mechanism. Old way vs new way. Product as hero.\n"
      + "- Product Aware: Remove doubt only. Testimonials, objection handling, FAQs. Do not re-explain.\n"
      + "- Most Aware: Push the offer. Urgency, discounts, deadlines. Do not over-educate.\n\n"
      + "SCRIPT STRUCTURES:\n"
      + "- Direct: Hook to Promise to Risk Reversal to Proof to CTA\n"
      + "- Indirect: Hook to Story to Proof to Free Resource to CTA\n"
      + "- E-commerce: Curiosity Hook to Problem to Failed Solution to Product to Demo to Proof to Offer to CTA\n"
      + "- Coaches: Hook to Relatable Story to Pain to Discovery to Proof to Offer to CTA\n\n"
      + "VILLAIN/HERO STRUCTURE:\n"
      + "- Name what has been failing them (villain), then introduce the product as hero.\n\n"
      + "PROOF: Add before or right after CTA. Types: testimonials, results, reviews, demos, social proof.\n\n"
      + "CTA BY FUNNEL STAGE:\n"
      + "- Cold: Soft CTA - 'See how it works', 'Learn why this happens'\n"
      + "- Warm: Trust CTA - 'See customer results', 'Read the reviews'\n"
      + "- Hot: Purchase CTA - 'Get 33% off today', 'Order before the sale ends'\n\n"
      + "RETENTION: Rehook at every transition. 'But that is only half the problem', 'This is where most people mess up'\n\n"
      + "OBJECTIONS: Handle inside the script. Price, efficacy, trust, time.\n\n"
      + "=== FRAMEWORK 2: WINNING HOOK FRAMEWORK ===\n\n"
      + "THE PURPOSE OF A HOOK: Get the RIGHT people to stop scrolling. A hook that gets views but wrong audience is a bad hook.\n\n"
      + "EVERY WINNING HOOK DOES 5 THINGS:\n"
      + "1. Stops the scroll\n"
      + "2. Creates curiosity\n"
      + "3. Identifies the audience\n"
      + "4. Creates emotion\n"
      + "5. Promises an outcome\n\n"
      + "UNIVERSAL HOOK FORMULA: Identity + Emotion + Curiosity + Outcome + Novelty\n"
      + "Example: 'Women over 40: stop making this collagen mistake.'\n\n"
      + "HOOK HIERARCHY:\n"
      + "- Level 1 Visual Hook: Viewer sees your face, product, action, environment BEFORE reading a word. Visuals should show the product, result, or problem.\n"
      + "- Level 2 Identity Hook: Immediately identify who this is for. 'If you are over 40', 'For busy moms', 'Business owners'. Meta uses these for audience matching.\n"
      + "- Level 3 Emotional Hook: Fear, mistake, warning, frustration, FOMO, curiosity, anger. Strongest emotions: 'Dangerous', 'Stop doing this', 'Why did nobody tell me?'\n\n"
      + "TOP 10 HOOK CATEGORIES:\n"
      + "1. Demographic: 'If you are a woman over 40' - best for scaling\n"
      + "2. If You: 'If you struggle with acne' - best for problem-aware\n"
      + "3. Contrarian: 'Everything you heard about collagen is wrong' - best for pattern interruption\n"
      + "4. Why Did Nobody Tell Me: 'I wish I knew this years ago' - best for FOMO\n"
      + "5. Founder: 'I am Sarah, founder of...' - best for trust\n"
      + "6. Story: 'I almost quit', 'I wasted $20,000 trying to solve this' - best for engagement\n"
      + "7. Curiosity Object: Holding product without revealing it - best for physical products\n"
      + "8. Reaction: Shock, crying, surprise, first impression - best for UGC\n"
      + "9. Controversy: 'The skincare industry lied to you' - best for comments and shares\n"
      + "10. Transformation: 'Before vs after', 'Watch this happen' - best for beauty and fitness\n\n"
      + "TRIGGER WORDS THAT WIN:\n"
      + "- Curiosity: Secret, Hidden, Unknown, Revealed\n"
      + "- Fear: Mistake, Dangerous, Risk, Warning\n"
      + "- Controversy: Scam, Lie, Wrong, Truth\n"
      + "- Desire: Fast, Easy, Instant, Effortless\n"
      + "- Frustration: Stop, Avoid, Never, Do not\n\n"
      + "HOOK LENGTH: Best is 5-8 words. Acceptable up to 12. Avoid 13+. Shorter wins.\n\n"
      + "INTEREST LOOP: After hook, create a chain of questions. Each answer creates another question. Keeps retention high.\n\n"
      + "HIGHEST PROBABILITY FORMULA: Identity + Negative Emotion + Curiosity Gap + Specific Outcome + Strong Visual\n"
      + "Examples: 'Women over 40: stop making this collagen mistake.' or 'Business owners: this is why your ads fail.'\n\n"
      + "=== END FRAMEWORKS ===\n\n"
      + "VIDEO DETAILS:\n"
      + "- Duration: " + duration + "s\n"
      + "- Format: " + orient + "\n"
      + "- Audience awareness: " + (awarenessMap[awareness] || "Not specified") + "\n"
      + "- Funnel stage: " + (funnelMap[funnel] || "Not specified") + "\n"
      + "- Ad type: " + (adTypeMap[adType] || "Not specified") + "\n\n"
      + "TRANSCRIPT:\n\"\"\"\n" + transcript + "\n\"\"\"\n\n"
      + "Analyze this ad using both frameworks above. Be encouraging and constructive. Quote their actual words.\n\n"
      + "TONE AND LANGUAGE GUIDELINES:\n"
      + "- Write like a smart, plain-speaking friend. Not a marketing consultant.\n"
      + "- Never use internal framework labels in feedback. Do not say: Level 1 visual hook, Level 2 identity hook, Level 3 emotional hook, Problem Aware to Solution Aware arc, villain/hero structure, interest loop, market sophistication, Stage 1/2/3/4/5, highest probability formula.\n"
      + "- Instead describe what you mean in plain terms. Not 'this lacks a Level 2 identity hook' but 'your opening line does not say who this ad is for'.\n"
      + "- Every sentence should be 10-15 words maximum. Short and clear.\n"
      + "- Assume the reader is a small business owner or creator who is new to running ads.\n"
      + "- Lead with genuine strengths - find what is actually working\n"
      + "- Frame improvements as opportunities, not failures\n"
      + "- Be encouraging and specific, like a good coach\n"
      + "- Score fairly - a solid ad with one weak area is still a 70+\n"
      + "- Reserve scores below 50 for ads with multiple serious problems\n\n"
      + "Return ONLY raw JSON, no markdown, no backticks:\n"
      + "{\n"
      + "  \"score\": 74,\n"
      + "  \"verdict\": \"Solid Ad\",\n"
      + "  \"summary\": \"2-3 warm, specific sentences about what this ad does well and where the biggest opportunity is. Reference their actual hook and offer.\",\n"
      + "  \"strengths\": [\n"
      + "    \"One thing working well in 1-2 sentences. State the observation, not the advice.\",\n"
      + "    \"Second strength in 1-2 sentences.\",\n"
      + "    \"Third strength in 1-2 sentences.\"\n"
      + "  ],\n"
      + "  \"improvements\": [\n"
      + "    {\n"
      + "      \"issue\": \"One problem in 1-2 sentences. State what is wrong and which framework rule it breaks. Do not explain how to fix it.\",\n"
      + "      \"rewrite\": \"Only if a single line swap helps — 1 sentence using their actual words. Otherwise null.\"\n"
      + "    },\n"
      + "    {\n"
      + "      \"issue\": \"Second problem in 1-2 sentences.\",\n"
      + "      \"rewrite\": null\n"
      + "    },\n"
      + "    {\n"
      + "      \"issue\": \"Third problem in 1-2 sentences.\",\n"
      + "      \"rewrite\": null\n"
      + "    }\n"
      + "  ],\n"
      + "  \"recommendations\": [\n"
      + "    \"First forward-looking idea to make this ad even stronger. Specific to their product and script.\",\n"
      + "    \"Second recommendation.\",\n"
      + "    \"Third recommendation.\"\n"
      + "  ]\n"
      + "}\n\n"
      + "Rules:\n"
      + "- Exactly 3 strengths, 3 improvements, 3 recommendations\n"
      + "- Each strength: exactly 1 sentence, 10-15 words. What is working. No advice.\n"
      + "- Each improvement issue: max 2 sentences, 10-15 words each. State the problem only. No solutions — that is what recommendations are for.\n"
      + "- Rewrite: 1 sentence, 10-15 words. Only when a direct line swap helps. Otherwise null.\n"
      + "- Recommendations: 1-2 sentences each, 10-15 words per sentence. The HOW. Specific and actionable.\n"
      + "- Everything references their actual words and product\n"
      + "- Tone is constructive and encouraging throughout\n"
      + "- Zero generic advice\n"
      + "- CRITICAL: Do not use apostrophes or quote marks inside any JSON string values. Write do not instead of don't, will not instead of won't, you are instead of you're. This prevents JSON parse errors.";

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

    // Fix unescaped quotes inside JSON string values that break parsing
    let jsonStr = match[0];
    // Try parsing as-is first, then attempt cleanup
    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.log("JSON parse failed, attempting cleanup:", parseErr.message);
      // Replace smart/curly quotes with straight quotes
      jsonStr = jsonStr.replace(/\u2018|\u2019/g, "\'").replace(/\u201C|\u201D/g, '\\"');
      // Try again
      try {
        analysis = JSON.parse(jsonStr);
      } catch (e2) {
        throw new Error("JSON parse error: " + parseErr.message + " | Raw: " + jsonStr.slice(0, 300));
      }
    }

    res.json({ transcript, analysis });

  } catch (err) {
    console.error("Error:", err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ error: err.response ? (err.response.data.error && err.response.data.error.message) || err.message : err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.post("/lead", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });

  const firstName = name.split(" ")[0];
  const lastName = name.split(" ").slice(1).join(" ") || "";
  const GHL_KEY = "pit-d4ad807e-caf2-4d5c-994b-503d096cb1cb";
  const LOCATION_ID = "pit-5385e15d-87ac-4288-a528-569a33dd52fb";

  try {
    const ghlRes = await axios.post(
      "https://services.leadconnectorhq.com/contacts/",
      {
        firstName: firstName,
        lastName: lastName,
        email: email,
        locationId: LOCATION_ID,
        source: "RateMyAd",
        tags: ["RateMyAd"]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GHL_KEY,
          "Version": "2021-07-28"
        }
      }
    );
    console.log("GHL contact created:", JSON.stringify(ghlRes.data).slice(0, 100));
    res.json({ success: true });
  } catch (err) {
    const errData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("GHL error:", errData);
    res.status(500).json({ error: "Failed to save lead", detail: errData });
  }
});

app.listen(PORT, () => console.log("RateMyAd backend on port " + PORT));
