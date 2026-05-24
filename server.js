// server.js - ZASS AI AGENT (Fixed for Heroku)
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ==================== AI CONFIGURATION ====================
const GEMINI_API_KEY = 'AIzaSyAgzX8szyUGq2TxCoUgAJx7U-z4FSgiLP8';
const CONTACT_EMAIL = 'citytechuk@gmail.com';
const CONTACT_PHONE = '+25576323348';

// ==================== API ENDPOINTS ====================

// AI Chat Endpoint
app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `You are ZASS AI Assistant, a helpful customer support bot for an enterprise browser API platform. Be friendly, professional, and concise. Respond to: ${message}` }]
                }]
            })
        });
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || getSmartReply(message);
        res.json({ success: true, response: reply });
    } catch (error) {
        console.error('AI Error:', error);
        res.json({ success: true, response: getSmartReply(message) });
    }
});

function getSmartReply(message) {
    const msg = message.toLowerCase();
    if (msg.includes('price') || msg.includes('bei')) {
        return "💰 *ZASS Pricing:*\n\n• Free: $0/mo (500 requests)\n• Pro: $49/mo (5,000 requests)\n• Business: $99/mo (15,000 requests)\n• Enterprise: $299/mo (unlimited)\n\nWhich plan interests you?";
    }
    if (msg.includes('payment') || msg.includes('malipo')) {
        return `💳 *Payment Instructions:*\n\nBank: NMB Bank Tanzania\nAccount: 5161480052318274\nAccount Name: ZASS Enterprise Solutions\nSWIFT: NMBLTZTZ\n\nAfter payment, email ${CONTACT_EMAIL} with payment reference.`;
    }
    if (msg.includes('api key')) {
        return "🔑 To get an API key:\n1. Register an account\n2. Complete payment (for paid plans)\n3. Your API key will appear in dashboard\n\nFree plan users get API key immediately!";
    }
    if (msg.includes('help')) {
        return "🤝 I can help you with:\n• Pricing plans\n• Payment methods\n• API keys\n• Technical support\n• Account management\n\nWhat do you need?";
    }
    return "Hello! I'm ZASS AI Assistant. How can I help you today? Ask me about pricing, payments, or API keys!";
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// ==================== FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🤖 ZASS AI AGENT - DEPLOYED SUCCESSFULLY                          ║
║   ===============================================                    ║
║                                                                      ║
║   ✅ Status: ONLINE                                                  ║
║   ✅ Port: ${PORT}                                                    ║
║   ✅ AI Model: Gemini 2.0 Flash                                      ║
║                                                                      ║
║   📱 URL: https://your-app.herokuapp.com                             ║
║   💬 Chat with AI Agent on the dashboard!                           ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    `);
});
