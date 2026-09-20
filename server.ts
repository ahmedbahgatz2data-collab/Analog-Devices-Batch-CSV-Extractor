import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

let __dirname = process.cwd();
try {
  if (typeof __filename === 'undefined' && typeof import.meta !== 'undefined' && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else if (typeof __dirname !== 'undefined') {
    // Already available in CJS
  }
} catch (e) {
  __dirname = process.cwd();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // API Endpoint to fetch and parse external JS e-commerce data from Analog Devices or similar URLs
  app.post("/api/fetch-url", async (req, res) => {
    try {
      const { url } = req.body;
      const targetUrl = url || "https://www.analog.com/cdp/ecommdata/en/mux08.js";

      console.log(`Fetching data from: ${targetUrl}`);
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const rawText = await response.text();

      let parsedData: any = null;
      let parseMethod = "raw";

      // Try direct JSON parse
      try {
        parsedData = JSON.parse(rawText);
        parseMethod = "direct_json";
      } catch (e) {
        // Try cleaning JS variable assignments like `var data = ...;` or `window.foo = ...;` or `ecommData = ...`
        try {
          // Remove leading variable declaration (e.g. `var xxx =` or `window.xxx =` or `xxx =`)
          let cleaned = rawText
            .replace(/^\s*(var|let|const|window\.)\s*[\w\d_$]+\s*=\s*/, '')
            .replace(/;\s*$/, '');
          
          parsedData = Function('"use strict"; return (' + cleaned + ')')();
          parseMethod = "js_assignment_eval";
        } catch (err1) {
          // Try generic regex for any JSON object/array assignment
          const jsonMatch = rawText.match(/=\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*;?\s*$/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              let snippet = jsonMatch[1].trim();
              parsedData = Function('"use strict"; return (' + snippet + ')')();
              parseMethod = "js_regex_eval";
            } catch (err2) {
              console.error("Regex eval failed:", err2);
            }
          }

          // Fallback: search for first [ or { and last ] or }
          if (!parsedData) {
            const firstBrace = rawText.indexOf("{");
            const firstBracket = rawText.indexOf("[");
            const startIdx = (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) ? firstBracket : firstBrace;
            
            if (startIdx !== -1) {
              const lastBrace = rawText.lastIndexOf("}");
              const lastBracket = rawText.lastIndexOf("]");
              const endIdx = Math.max(lastBrace, lastBracket);
              if (endIdx > startIdx) {
                const snippet = rawText.substring(startIdx, endIdx + 1);
                try {
                  parsedData = Function('"use strict"; return (' + snippet + ')')();
                  parseMethod = "substring_eval";
                } catch (e3) {
                  console.error("Substring eval failed:", e3);
                }
              }
            }
          }
        }
      }

      // If we couldn't parse structured data, package the raw text into a inspectable format
      if (!parsedData) {
        parsedData = {
          rawContent: rawText,
          message: "Could not auto-parse as structured JSON/JS object, but raw text was retrieved successfully."
        };
      } else {
        console.log("Parsed Data structure sample:", JSON.stringify(parsedData).slice(0, 500));
      }

      res.json({
        success: true,
        url: targetUrl,
        parseMethod,
        rawLength: rawText.length,
        data: parsedData
      });

    } catch (error: any) {
      console.error("Error fetching URL:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch and parse URL data"
      });
    }
  });

  // API Endpoint for AI Analysis using Gemini API
  app.post("/api/analyze", async (req, res) => {
    try {
      const { dataSummary, prompt, language } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: "GEMINI_API_KEY is not configured. Please add it in AI Studio settings."
        });
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are an expert semiconductor engineer, data scientist, and e-commerce analyst specializing in Analog Devices products, multiplexers (mux), pricing, stock, and IC datasheets.
Provide clear, accurate, and structured insights based on the provided dataset. Support both Arabic and English queries.`;

      const userPrompt = `Here is a summary or sample of the extracted data from Analog Devices:
\`\`\`json
${JSON.stringify(dataSummary, null, 2).slice(0, 15000)}
\`\`\`

User Question / Request:
${prompt}

Please answer comprehensively in ${language === 'ar' ? 'Arabic' : 'English'}, providing clear analysis, data points, part numbers, pricing insights, or recommendations where applicable.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });

      res.json({
        success: true,
        result: response.text
      });

    } catch (error: any) {
      console.error("AI Analysis error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate AI analysis"
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
