import { useState, useRef, useEffect } from "react";

// ── Replace with your deployed backend URL ───────────────────────
// Local dev:  http://localhost:3001
// Production: https://your-server.com
const BACKEND_URL = "http://localhost:3001";

const C = {
  bg: "#080810", surf: "#10101E", surf2: "#18182C",
  bdr: "#2A2A42", txt: "#E8E8F4", muted: "#6060A0",
  acc: "#B66DFF", grn: "#00E5A0", yel: "#FFD060", red: "#FF4D6A"
};

function Ring({ score }) {
  const [n, setN] = useState(0);
  const r = 54, circ = 2 * Math.PI * r;
  const color = score >= 70 ? C.grn : score >= 45 ? C.yel : C.red;
  useEffect(() => {
    let start = null;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 1200, 1);
      setN(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);
  return (
    <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto 16px" }}>
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke={C.surf2} strokeWidth="9" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.4,0.64,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 42, fontWeight: 700, lineHeight: 1, color: C.txt }}>{n}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>out of 100</div>
      </div>
    </div>
  );
}

function SignalBar({ label, value, max }) {
  const pct = Math.max(0, Math.min(100, ((value + max) / (max * 2)) * 100));
  const color = pct >= 65 ? C.grn : pct >= 40 ? C.yel : C.red;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color }}>{value > 0 ? "+" : ""}{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.surf2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function OptionBtn({ label, sub, selected, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${selected ? C.acc : C.bdr}`, background: selected ? "rgba(182,109,255,0.08)" : C.surf, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", marginBottom: 8, transition: "all 0.15s" }}>
      <div style={{ color: selected ? C.txt : C.muted }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 3 }}>{sub}</div>}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 12, marginTop: 24, display: "flex", alignItems: "center", gap: 8 }}>
      {children}<div style={{ flex: 1, height: 1, background: C.bdr }} />
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "36px 20px" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${C.bdr}`, borderTopColor: C.acc, animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 1.6 }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

async function transcribeVideo(file, onStatus) {
  onStatus("Uploading video for transcription…");
  const formData = new FormData();
  formData.append("video", file);
  const res = await fetch(`${BACKEND_URL}/transcribe`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Transcription failed");
  }
  const { transcript } = await res.json();
  return transcript;
}

async function analyzeWithClaude(transcript, videoMeta, awareness, funnel, adType, onStatus) {
  onStatus("Analyzing your script…");

  const awarenessMap = {
    unaware: "Unaware — audience doesn't know they have the problem yet",
    problem_aware: "Problem Aware — they know the problem but not the solution",
    solution_aware: "Solution Aware — they know solutions exist but not this product",
    product_aware: "Product Aware — they know the product but aren't sold yet",
    most_aware: "Most Aware — they want it, just need a reason to buy now",
  };
  const funnelMap = { top: "Top of Funnel (cold)", middle: "Middle of Funnel (warm)", bottom: "Bottom of Funnel (hot)" };
  const adTypeMap = { direct: "Direct — Hook → Promise → Risk Reversal → Proof → CTA", indirect: "Indirect — Hook → Story → Free Resource → CTA" };
  const orient = videoMeta.width && videoMeta.height
    ? (videoMeta.width < videoMeta.height ? "Vertical 9:16 ✓" : "Landscape ⚠️ — should be 9:16 vertical")
    : "Unknown";

  const prompt = `You are an expert paid social media ad analyst for Meta and TikTok.

You have the verbatim transcript of a video ad. Analyze it deeply. Every piece of feedback must reference their actual words, hook line, offer, and CTA. Zero generic advice.

VIDEO DETAILS:
- Duration: ${videoMeta.duration}s
- Format: ${orient}
- File size: ${videoMeta.size}
- Audience awareness: ${awarenessMap[awareness] || "Not specified"}
- Funnel stage: ${funnelMap[funnel] || "Not specified"}
- Ad type: ${adTypeMap[adType] || "Not specified"}

TRANSCRIPT:
"""
${transcript}
"""

SCORING RULES (by weight):
1. Hook (first 3s) — HIGHEST. Pattern interrupt? Bold claim? Curiosity gap? Never open with brand name or CTA.
2. Completion/Pacing — HIGHEST. Every line earns its place? No filler?
3. Script structure — right formula for awareness level and ad type?
4. CTA — matched to funnel stage? Not in first 3 seconds?
5. Engagement design — saves, shares, comment triggers?
6. Visual direction — does the script suggest strong visuals?

AWARENESS RULES:
- Unaware: hook must CREATE the problem. Curiosity/demo/shock. Don't pitch yet.
- Problem Aware: call out the pain, explain why it keeps happening. Villain → Hero.
- Solution Aware: new mechanism. Old way vs new way. Product as hero.
- Product Aware: remove doubt only. Testimonials, objections, proof. Don't re-explain.
- Most Aware: push the offer. Urgency. Don't over-educate.

SCRIPT BEST PRACTICES:
- Rehook throughout: "But that's only half the problem", "This is where most people mess up"
- Every line should suggest a visual
- Proof before or right after CTA
- Never open with brand name or logo
- CTA must match funnel stage

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
      "issue": "<what is wrong — quote their actual words from the transcript>",
      "fix": "<specific rewrite using their actual product, offer, or script — not generic>"
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse Claude response");
  return JSON.parse(match[0]);
}

export default function App() {
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [awareness, setAwareness] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [adType, setAdType] = useState(null);
  const [stage, setStage] = useState("idle");
  const [stageLabel, setStageLabel] = useState("");
  const [result, setResult] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const inputRef = useRef();
  const videoRef = useRef();

  function pickFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f); setVideoUrl(URL.createObjectURL(f));
    setResult(null); setTranscript(null); setStage("idle");
  }

  async function analyze() {
    const videoEl = videoRef.current;
    const dur = videoEl?.duration || 0;
    const width = videoEl?.videoWidth || 0;
    const height = videoEl?.videoHeight || 0;
    setResult(null); setTranscript(null); setStage("working");

    try {
      const tx = await transcribeVideo(file, setStageLabel);
      setTranscript(tx);
      const res = await analyzeWithClaude(tx, {
        duration: Math.round(dur),
        size: (file.size / 1024 / 1024).toFixed(1) + " MB",
        width, height
      }, awareness, funnel, adType, setStageLabel);
      setResult(res);
      setStage("done");
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      console.error(err);
      setStageLabel(err.message);
      setStage("error");
    }
  }

  function reset() {
    setFile(null); setVideoUrl(null); setAwareness(null); setFunnel(null);
    setAdType(null); setResult(null); setTranscript(null); setStage("idle"); setStageLabel("");
    if (inputRef.current) inputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pc = p => p === "high" ? C.red : p === "med" ? C.yel : C.grn;
  const vColor = result ? (result.score >= 70 ? C.grn : result.score >= 45 ? C.yel : C.red) : C.acc;
  const hookColor = result?.hook_verdict === "Strong" ? C.grn : result?.hook_verdict === "Needs Work" ? C.yel : C.red;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: C.bg, minHeight: "100vh", color: C.txt }}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.bdr}`, background: "rgba(8,8,16,.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18 }}>Rate<span style={{ color: C.acc }}>My</span>.Ad</span>
      </div>

      <div style={{ padding: "28px 24px 60px", maxWidth: 460, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, letterSpacing: -0.5, marginBottom: 8 }}>
          Know if your ad will <span style={{ color: C.acc }}>perform</span> before you spend.
        </h1>
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, marginBottom: 28 }}>
          Upload your video — we'll transcribe it and give feedback on your actual hook, script, and CTA.
        </p>

        {!videoUrl ? (
          <div onClick={() => inputRef.current?.click()} style={{ border: `1.5px dashed ${C.bdr}`, borderRadius: 20, background: C.surf, cursor: "pointer", aspectRatio: "9/14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 32, textAlign: "center" }}>
            <input ref={inputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={pickFile} />
            <div style={{ width: 64, height: 64, borderRadius: 18, background: C.surf2, border: `1px solid ${C.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🎬</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Upload your video ad</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>MP4 or MOV · We'll transcribe it automatically</div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.acc, background: "rgba(182,109,255,.1)", padding: "7px 16px", borderRadius: 20 }}>↑ Tap to choose file</div>
          </div>
        ) : (
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", aspectRatio: "9/14", background: C.surf2 }}>
            <video ref={videoRef} src={videoUrl} muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,8,16,.85) 0%, transparent 50%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            <button onClick={reset} style={{ position: "absolute", top: 14, right: 14, background: "rgba(8,8,16,.7)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer" }}>Change</button>
          </div>
        )}

        {file && stage === "idle" && (
          <>
            <SectionLabel>Who is this ad targeting?</SectionLabel>
            <OptionBtn label="Unaware" sub="They don't know they have the problem yet" selected={awareness === "unaware"} onClick={() => setAwareness("unaware")} />
            <OptionBtn label="Problem Aware" sub="They know the problem but not your solution" selected={awareness === "problem_aware"} onClick={() => setAwareness("problem_aware")} />
            <OptionBtn label="Solution Aware" sub="They know solutions exist but not your product" selected={awareness === "solution_aware"} onClick={() => setAwareness("solution_aware")} />
            <OptionBtn label="Product Aware" sub="They know your product but aren't sold yet" selected={awareness === "product_aware"} onClick={() => setAwareness("product_aware")} />
            <OptionBtn label="Most Aware" sub="They want it — just need a reason to buy now" selected={awareness === "most_aware"} onClick={() => setAwareness("most_aware")} />

            <SectionLabel>Where in your funnel?</SectionLabel>
            <OptionBtn label="Top of Funnel" sub="Cold audience — attention and curiosity" selected={funnel === "top"} onClick={() => setFunnel("top")} />
            <OptionBtn label="Middle of Funnel" sub="Warm audience — trust and belief" selected={funnel === "middle"} onClick={() => setFunnel("middle")} />
            <OptionBtn label="Bottom of Funnel" sub="Hot audience — push to purchase" selected={funnel === "bottom"} onClick={() => setFunnel("bottom")} />

            <SectionLabel>What type of ad?</SectionLabel>
            <OptionBtn label="Direct" sub="Hook → Promise → Proof → CTA" selected={adType === "direct"} onClick={() => setAdType("direct")} />
            <OptionBtn label="Indirect" sub="Hook → Story → Free Resource → CTA" selected={adType === "indirect"} onClick={() => setAdType("indirect")} />

            <button onClick={analyze} style={{ width: "100%", marginTop: 20, padding: 17, borderRadius: 14, border: "none", background: `linear-gradient(135deg,#7B2FE0,${C.acc})`, color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              Rate My Ad
            </button>
          </>
        )}

        {stage === "working" && (
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, marginTop: 20 }}>
            <Spinner label={stageLabel || "Processing…"} />
          </div>
        )}

        {stage === "error" && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "rgba(255,77,106,.1)", border: `1px solid ${C.red}`, color: C.red, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Something went wrong</div>
            <div style={{ wordBreak: "break-word" }}>{stageLabel}</div>
            <button onClick={() => setStage("idle")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Try again</button>
          </div>
        )}

        {stage === "done" && result && (
          <div id="results" style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              Your results <div style={{ flex: 1, height: 1, background: C.bdr }} />
            </div>

            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20, padding: "28px 24px 24px", textAlign: "center", marginBottom: 14 }}>
              <Ring score={result.score} />
              <div style={{ fontSize: 16, fontWeight: 700, color: vColor, marginBottom: 6 }}>{result.verdict}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{result.summary}</div>
            </div>

            {result.hook_quote && (
              <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Your Hook</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: hookColor, background: `${hookColor}22`, padding: "3px 10px", borderRadius: 20 }}>{result.hook_verdict}</div>
                </div>
                <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic", lineHeight: 1.6, marginBottom: 12 }}>"{result.hook_quote}"</div>
                {result.hook_rewrite && (
                  <>
                    <div style={{ height: 1, background: C.bdr, marginBottom: 12 }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.grn, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Suggested rewrite</div>
                    <div style={{ fontSize: 13, color: C.txt, lineHeight: 1.6 }}>"{result.hook_rewrite}"</div>
                  </>
                )}
              </div>
            )}

            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14 }}>Signal Breakdown</div>
              <SignalBar label="Hook Strength" value={result.signals?.hook || 0} max={18} />
              <SignalBar label="Watch Time / Completion" value={result.signals?.watch || 0} max={18} />
              <SignalBar label="Script Structure" value={result.signals?.structure || 0} max={10} />
              <SignalBar label="CTA Match" value={result.signals?.cta || 0} max={8} />
              <SignalBar label="Engagement Design" value={result.signals?.engagement || 0} max={10} />
              <SignalBar label="Visual Direction" value={result.signals?.visuals || 0} max={8} />
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>How to improve it</div>
            {(result.suggestions || []).map((s, i) => (
              <div key={i} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: pc(s.priority), marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: pc(s.priority), marginBottom: 4 }}>{s.tag}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: C.muted, marginBottom: s.fix ? 10 : 0 }}>{s.issue}</div>
                    {s.fix && (
                      <div style={{ padding: "10px 14px", background: C.surf2, borderRadius: 10, borderLeft: `2px solid ${C.acc}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Try this instead</div>
                        <div style={{ fontSize: 13, color: C.txt, lineHeight: 1.55 }}>{s.fix}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {transcript && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 12, color: C.muted, cursor: "pointer", padding: "10px 0" }}>View transcript</summary>
                <div style={{ marginTop: 8, padding: 14, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, fontSize: 12, color: C.muted, lineHeight: 1.7, fontStyle: "italic" }}>
                  "{transcript}"
                </div>
              </details>
            )}

            <button onClick={reset} style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 12, border: `1.5px solid ${C.bdr}`, background: "transparent", color: C.muted, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              ← Rate another ad
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
