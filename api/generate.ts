import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // CORS headers for Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  console.log("Received generation request on Vercel...");
  try {
    const { prompt, parts, aspectRatio } = req.body;
    
    const customKey = process.env.VITE_BROYA_KEY;
    const sharedKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const apiKey = customKey || sharedKey;
    
    const isCustom = !!customKey && customKey !== "";
    
    if (!apiKey) {
      console.error("No API key found in environment");
      return res.status(500).json({ 
        error: "API Key not configured. Please add VITE_BROYA_KEY to your Vercel Environment Variables.",
        isCustom: false
      });
    }

    console.log(`Using ${isCustom ? 'CUSTOM' : 'SHARED'} API Key starting with: ${apiKey.substring(0, 6)}...`);
    const ai = new GoogleGenAI({ apiKey });

    const modelName = "gemini-3.1-flash-image-preview";
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [...parts, { text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

    if (part?.inlineData) {
      res.status(200).json({ 
        image: {
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data
        },
        isCustom
      });
    } else {
      res.status(400).json({ 
        error: "No image generated. The AI might have blocked the content.",
        isCustom
      });
    }
  } catch (error: any) {
    const isCustom = !!process.env.VITE_BROYA_KEY;
    console.error("Server Generation Error:", error);
    res.status(error.status || 500).json({ 
      error: error.message || "Internal Server Error",
      isCustom,
      status: error.status
    });
  }
}
