const express = require("express");
const multer = require("multer");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const app = express();
const upload = multer({ dest: "uploads/" });

// ── Config ───────────────────────────────────────────────────────
const ASSEMBLY_KEY = process.env.ASSEMBLYAI_API_KEY;
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────
app.use(cors({ origin: "*" })); // Lock this down to your domain in production
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── POST /transcribe ─────────────────────────────────────────────
// Accepts a video file upload, sends to AssemblyAI, returns transcript
app.post("/transcribe", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file provided" });
  }

  const filePath = req.file.path;

  try {
    // Step 1: Upload file to AssemblyAI
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
    console.log("Upload complete:", audioUrl);

    // Step 2: Submit for transcription
    const transcriptRes = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: audioUrl, language_code: "en" },
      { headers: { authorization: ASSEMBLY_KEY, "content-type": "application/json" } }
    );
    const transcriptId = transcriptRes.data.id;
    console.log("Transcription job submitted:", transcriptId);

    // Step 3: Poll until complete
    let transcript = null;
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLY_KEY } }
      );
      const { status, text, error } = poll.data;
      console.log("Status:", status);

      if (status === "completed") {
        transcript = text;
        break;
      }
      if (status === "error") {
        throw new Error("AssemblyAI error: " + error);
      }
    }

    res.json({ transcript });
  } catch (err) {
    console.error("Transcription failed:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up temp file
    fs.unlink(filePath, () => {});
  }
});

app.listen(PORT, () => {
  console.log(`RateMyAd backend running on port ${PORT}`);
});
