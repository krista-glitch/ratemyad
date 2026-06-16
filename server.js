const express = require("express");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
const PORT = process.env.PORT || 8080;

// ── CORS — explicitly handle all methods and headers ─────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── POST /transcribe ─────────────────────────────────────────────
app.post("/transcribe", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file provided" });
  }

  const filePath = req.file.path;

  try {
    // Step 1: Upload to AssemblyAI
    console.log("Uploading to AssemblyAI...");
    const fileStream = fs.createReadStream(filePath);
    const uploadRes = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fileStream,
      {
        headers: {
          authorization: ASSEMBLY_KEY,
          "content-type": "application/octet-stream",
          "transfer-encoding": "chunked",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    const audioUrl = uploadRes.data.upload_url;
    console.log("Uploaded:", audioUrl);

    // Step 2: Request transcription
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: audioUrl, language_code: "en" },
      { headers: { authorization: ASSEMBLY_KEY, "content-type": "application/json" } }
    );
    const transcriptId = transcriptRes.data.id;
    console.log("Transcription job:", transcriptId);

    // Step 3: Poll until done
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLY_KEY } }
      );
      const { status, text, error } = poll.data;
      console.log("Status:", status);
      if (status === "completed") { res.json({ transcript: text }); break; }
      if (status === "error") throw new Error("AssemblyAI: " + error);
    }
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.listen(PORT, () => console.log(`RateMyAd backend on port ${PORT}`));
