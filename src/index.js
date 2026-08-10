export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Telegram Webhook Handling
    if (url.pathname === "/telegram" && request.method === "POST") {
      return handleTelegram(request, env);
    }

    // 2. WhatsApp Webhook Verification (GET)
    if (url.pathname === "/whatsapp" && request.method === "GET") {
      return handleWhatsAppVerification(url, env);
    }

    // 3. WhatsApp Webhook Handling (POST)
    if (url.pathname === "/whatsapp" && request.method === "POST") {
      return handleWhatsAppMessage(request, env);
    }

    return new Response("FlyTripVisa Bot Worker Active", { status: 200 });
  }
};

// --- TELEGRAM LOGIC ---
async function handleTelegram(request, env) {
  try {
    const update = await request.json();
    if (!update.message || !update.message.text) return new Response("OK");

    const chatId = update.message.chat.id;
    const userMessage = update.message.text;

    // Run Cloudflare Workers AI
    const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [
        { role: "system", content: "You are FlyTripVisa Assistant. Help users with flight, trip, and visa queries." },
        { role: "user", content: userMessage }
      ]
    });

    const replyText = aiResponse.response || "Sorry, I couldn't process your request.";

    // Send back to Telegram
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: replyText })
    });

    return new Response("OK");
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}

// --- WHATSAPP LOGIC ---
function handleWhatsAppVerification(url, env) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function handleWhatsAppMessage(request, env) {
  try {
    const body = await request.json();
    const entry = body.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];

    if (message && message.type === "text") {
      const from = message.from;
      const userMessage = message.text.body;

      // Run Cloudflare Workers AI
      const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: [
          { role: "system", content: "You are FlyTripVisa Assistant. Help users with flight, trip, and visa queries." },
          { role: "user", content: userMessage }
        ]
      });

      const replyText = aiResponse.response || "Sorry, I couldn't process your request.";

      // Send back to WhatsApp Meta API
      await fetch(`https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyText }
        })
      });
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}
