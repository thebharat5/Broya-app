import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // API Route for Generation
  app.post("/api/generate", async (req, res) => {
    console.log("Received generation request...");
    try {
      const { prompt, parts, aspectRatio } = req.body;
      
      // Read key from server environment (Secrets menu)
      const apiKey = process.env.VITE_BROYA_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
      
      if (!apiKey) {
        console.error("API Key missing in environment variables");
        return res.status(500).json({ error: "API Key not configured on server. Please add VITE_BROYA_KEY to the Secrets menu." });
      }

      console.log("Using API Key starting with:", apiKey.substring(0, 8) + "...");
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [...parts, { text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

      if (part?.inlineData) {
        res.json({ 
          image: {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data
          }
        });
      } else {
        res.status(400).json({ error: "No image generated. The AI might have blocked the content or failed to process the request." });
      }
    } catch (error: any) {
      console.error("Server Generation Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
