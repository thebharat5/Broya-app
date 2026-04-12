import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

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
    const { prompt, aspectRatio, token } = req.body;
    
    const falKey = process.env.FAL_KEY;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: "Supabase keys not configured." });
    }
    if (!token) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    // 1. Initialize Supabase with the user's token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 2. Get user to verify token
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: "Invalid token or user not found." });
    }

    // 3. Deduct Credits securely via RPC
    const { data: success, error: rpcError } = await supabase.rpc('deduct_credits', { 
      user_id: user.id, 
      amount: 1 
    });

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      return res.status(500).json({ error: "Failed to deduct credits." });
    }

    if (!success) {
      return res.status(402).json({ error: "Insufficient credits. Please top up or watch an ad." });
    }

    let imageUrl = "";

    // 4. Call API (Fal.ai if key exists, otherwise free testing API)
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
        await supabase.rpc('deduct_credits', { user_id: user.id, amount: -1 });
        return res.status(falResponse.status).json({ error: "Fal API Error: " + errorText });
      }

      const falData = await falResponse.json();
      imageUrl = falData.images?.[0]?.url;

      if (!imageUrl) {
        // Refund credit if no image returned
        await supabase.rpc('deduct_credits', { user_id: user.id, amount: -1 });
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

    // 5. Log the generation
    await supabase.from('generations_log').insert({
      user_id: user.id,
      prompt: prompt,
      image_url: imageUrl,
      cost: 1,
      ip_address: req.headers['x-forwarded-for'] || 'unknown'
    });

    // 6. Return the image URL
    res.status(200).json({ imageUrl });
    
  } catch (error: any) {
    console.error("Server Generation Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
