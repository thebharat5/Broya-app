import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
}

admin.initializeApp({
  projectId: firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID,
});

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

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
      const { prompt, aspectRatio, token } = req.body;
      
      const falKey = process.env.FAL_KEY;
      
      if (!token) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
      }

      // 1. Verify token with Firebase Admin
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (authError) {
        return res.status(401).json({ error: "Invalid token or user not found." });
      }

      const userId = decodedToken.uid;

      // 2. Deduct Credits securely
      const userRef = db.collection('users').doc(userId);
      let success = false;
      
      try {
        await db.runTransaction(async (t) => {
          const doc = await t.get(userRef);
          if (!doc.exists) {
            throw new Error("User not found");
          }
          const currentCredits = doc.data()?.credits_balance || 0;
          if (currentCredits < 1) {
            throw new Error("Insufficient credits");
          }
          t.update(userRef, { credits_balance: currentCredits - 1 });
          success = true;
        });
      } catch (e: any) {
        if (e.message === "Insufficient credits") {
          return res.status(402).json({ error: "Insufficient credits. Please top up or watch an ad." });
        }
        console.error("Transaction Error:", e);
        return res.status(500).json({ error: "Failed to deduct credits." });
      }

      let imageUrl = "";

      // 3. Call API (Fal.ai if key exists, otherwise free testing API)
      if (falKey) {
        console.log("Calling Fal.ai...");
        
        // Map aspect ratio to Fal.ai format
        let image_size = "landscape_4_3";
        if (aspectRatio === "1:1") image_size = "square_hd";
        if (aspectRatio === "9:16") image_size = "portrait_9_16";
        if (aspectRatio === "16:9") image_size = "landscape_16_9";
        if (aspectRatio === "3:4") image_size = "portrait_4_3";

        const falResponse = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
          method: "POST",
          headers: {
            "Authorization": `Key ${falKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: prompt,
            image_size: image_size,
            num_images: 1,
            sync_mode: true
          })
        });

        if (!falResponse.ok) {
          const errorText = await falResponse.text();
          console.error("Fal API Error:", errorText);
          // Refund credit if generation fails
          await userRef.update({ credits_balance: admin.firestore.FieldValue.increment(1) });
          return res.status(falResponse.status).json({ error: "Fal API Error: " + errorText });
        }

        const falData = await falResponse.json();
        imageUrl = falData.images?.[0]?.url;

        if (!imageUrl) {
          // Refund credit if no image returned
          await userRef.update({ credits_balance: admin.firestore.FieldValue.increment(1) });
          return res.status(500).json({ error: "No image returned from Fal.ai" });
        }
      } else {
        console.log("FAL_KEY not found. Using free testing API (Pollinations)...");
        
        // Map aspect ratio to width/height
        let width = 1024; let height = 1024;
        if (aspectRatio === "9:16") { width = 576; height = 1024; }
        if (aspectRatio === "16:9") { width = 1024; height = 576; }
        if (aspectRatio === "3:4") { width = 768; height = 1024; }
        if (aspectRatio === "4:3") { width = 1024; height = 768; }

        // Simulate a slight delay to mimic real generation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const seed = Math.floor(Math.random() * 100000);
        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
      }

      // 4. Log the generation
      await db.collection('generations_log').add({
        user_id: userId,
        prompt: prompt,
        image_url: imageUrl,
        cost: 1,
        ip_address: req.ip,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Return the image URL
      res.json({ imageUrl });
      
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
