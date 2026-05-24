// bot.js - ZASS AI BOT (WhatsApp + WebSocket + Auto Payment)
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const axios = require('axios');

// ==================== CONFIGURATION ====================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
const PORT = process.env.BOT_PORT || 3001;
const ADMIN_PASSWORD = 'ZASSAdmin2026!@#$'; // CHANGE THIS!
const CONTACT_EMAIL = 'citytechuk@gmail.com';
const NMB_ACCOUNT = '5161480052318274';
const NMB_ACCOUNT_NAME = 'ZASS Enterprise Solutions';
const NMB_BANK = 'NMB Bank Tanzania';

// AI API Key (Gemini)
const GEMINI_API_KEY = 'AIzaSyAgzX8szyUGq2TxCoUgAJx7U-z4FSgiLP8';

// ==================== DATABASE ====================
let db;

async function initDatabase() {
    db = await open({ filename: './database/bot.sqlite', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT UNIQUE,
            email TEXT,
            company TEXT,
            api_key TEXT,
            plan TEXT DEFAULT 'free',
            payment_status TEXT DEFAULT 'pending',
            payment_ref TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            response TEXT,
            intent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS pending_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_phone TEXT,
            amount INTEGER,
            plan TEXT,
            payment_ref TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('✅ Bot Database Ready');
}

// ==================== WHATSAPP CLIENT ====================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

let isWhatsAppReady = false;
let connectedUsers = new Map();

whatsappClient.on('qr', (qr) => {
    console.log('📱 Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
    isWhatsAppReady = true;
    console.log('✅ WhatsApp Bot is ready!');
    console.log('📱 Bot is online 24/7');
});

whatsappClient.on('message', async (message) => {
    const from = message.from;
    const body = message.body.toLowerCase();
    
    console.log(`📩 Message from ${from}: ${body}`);
    
    // Check if it's a command
    if (body.startsWith('/')) {
        await handleCommand(message, from, body);
    } else {
        await handleAIResponse(message, from, body);
    }
});

// ==================== COMMAND HANDLER ====================
async function handleCommand(message, from, body) {
    const parts = body.split(' ');
    const cmd = parts[0].toLowerCase();
    
    // Admin authentication
    if (cmd === '/admin' && parts[1] === ADMIN_PASSWORD) {
        await message.reply(`🔐 *Admin Access Granted*\n\nAvailable Commands:\n/payments - View pending payments\n/verify [ref] - Verify payment\n/users - List all users\n/stats - Bot statistics\n/activate [phone] - Activate user\n/help - Show all commands`);
        return;
    }
    
    // Check if user is admin
    const isAdmin = body.includes(ADMIN_PASSWORD);
    
    if (cmd === '/start' || cmd === '/menu') {
        await message.reply(getMainMenu(from));
    }
    else if (cmd === '/register' && parts[1]) {
        await handleRegistration(message, from, parts.slice(1).join(' '));
    }
    else if (cmd === '/pricing' || cmd === '/bei') {
        await message.reply(getPricingInfo());
    }
    else if (cmd === '/pay' && parts[1]) {
        await handlePaymentRequest(message, from, parts[1]);
    }
    else if (cmd === '/status') {
        await checkUserStatus(message, from);
    }
    else if (cmd === '/apikey') {
        await getAPIKey(message, from);
    }
    else if (cmd === '/help') {
        await message.reply(getHelpMenu());
    }
    else if (cmd === '/payments' && isAdmin) {
        await listPendingPayments(message);
    }
    else if (cmd === '/verify' && parts[1] && isAdmin) {
        await verifyPayment(message, parts[1]);
    }
    else if (cmd === '/users' && isAdmin) {
        await listAllUsers(message);
    }
    else if (cmd === '/stats' && isAdmin) {
        await getBotStats(message);
    }
    else if (cmd === '/activate' && parts[1] && isAdmin) {
        await activateUser(message, parts[1]);
    }
    else {
        await message.reply(`❌ Unknown command. Type /help for available commands.`);
    }
}

// ==================== AI RESPONSE HANDLER ====================
async function handleAIResponse(message, from, body) {
    try {
        // Call Gemini AI
        const aiResponse = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: `You are ZASS AI Assistant, a helpful customer support bot for an enterprise browser API platform. Be friendly, concise, and professional. Respond to: ${body}` }] }]
        });
        
        let reply = aiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!reply) {
            reply = getSmartReply(body);
        }
        
        // Save conversation
        const user = await db.get('SELECT id FROM users WHERE phone = ?', [from]);
        if (user) {
            await db.run('INSERT INTO conversations (user_id, message, response) VALUES (?, ?, ?)', [user.id, body, reply]);
        }
        
        await message.reply(reply);
    } catch (error) {
        console.error('AI Error:', error);
        await message.reply(getSmartReply(body));
    }
}

function getSmartReply(message) {
    const msg = message.toLowerCase();
    if (msg.includes('price') || msg.includes('bei')) {
        return getPricingInfo();
    }
    if (msg.includes('register') || msg.includes('sign up')) {
        return "📝 *To register:*\nSend /register [Your Name] [Company Name] [Email]\n\nExample: /register John Doe ZASS Inc john@example.com";
    }
    if (msg.includes('payment') || msg.includes('pay')) {
        return "💰 *To make payment:*\n1. Type /pricing to see plans\n2. Type /pay [plan] (e.g., /pay pro)\n3. Follow payment instructions\n\nPayment is made to NMB Bank account 5161480052318274";
    }
    if (msg.includes('help')) {
        return getHelpMenu();
    }
    return "Hello! I'm ZASS AI Assistant. Type /help to see available commands or ask me anything about pricing, payments, or API keys!";
}

// ==================== MESSAGE HANDLERS ====================
function getMainMenu(phone) {
    return `🤖 *ZASS ENTERPRISE BOT* 🤖\n\n━━━━━━━━━━━━━━━━━━━━\n📌 *Available Commands:*\n━━━━━━━━━━━━━━━━━━━━\n\n💰 /pricing - View plans\n📝 /register [name] [company] [email] - Create account\n💳 /pay [plan] - Request payment\n🔑 /apikey - Get your API key\n📊 /status - Check account status\n❓ /help - Show all commands\n\n━━━━━━━━━━━━━━━━━━━━\n💬 *Ask me anything about ZASS!*`;
}

function getPricingInfo() {
    return `💰 *ZASS ENTERPRISE PRICING* 💰\n\n━━━━━━━━━━━━━━━━━━━━\n📊 *FREE PLAN* - $0/month\n✅ 500 requests/month\n✅ PNG & PDF output\n✅ Email support\n\n🚀 *PRO PLAN* - $49/month\n✅ 5,000 requests/month\n✅ Batch processing\n✅ Priority support\n\n🏢 *BUSINESS* - $99/month\n✅ 15,000 requests/month\n✅ Advanced analytics\n✅ 24/7 support\n\n👑 *ENTERPRISE* - $299/month\n✅ Unlimited requests\n✅ Dedicated infrastructure\n✅ SLA guarantee\n\n━━━━━━━━━━━━━━━━━━━━\n💳 *Payment:* NMB Bank ${NMB_ACCOUNT}\n📧 Contact: ${CONTACT_EMAIL}`;
}

function getHelpMenu() {
    return `❓ *ZASS BOT HELP* ❓\n\n━━━━━━━━━━━━━━━━━━━━\n📌 *BASIC COMMANDS*\n━━━━━━━━━━━━━━━━━━━━\n\n💰 /pricing - View all plans\n📝 /register [name] [company] [email]\n💳 /pay [plan] - Pro/Business/Enterprise\n🔑 /apikey - Get your API key\n📊 /status - Check payment status\n❓ /help - Show this menu\n\n━━━━━━━━━━━━━━━━━━━━\n🔧 *ADMIN COMMANDS*\n━━━━━━━━━━━━━━━━━━━━\n\n/admin [password] - Admin login\n/payments - View pending payments\n/verify [ref] - Verify payment\n/users - List all users\n/activate [phone] - Activate user\n/stats - Bot statistics\n\n━━━━━━━━━━━━━━━━━━━━\n💡 *Examples:*\n/register John Doe ZASS Inc john@email.com\n/pay pro\n/status\n\n━━━━━━━━━━━━━━━━━━━━\n📞 Contact: ${CONTACT_EMAIL}`;
}

// ==================== REGISTRATION HANDLER ====================
async function handleRegistration(message, from, data) {
    const parts = data.split(' ');
    if (parts.length < 3) {
        await message.reply(`❌ *Invalid format!*\n\nCorrect format:\n/register [Your Name] [Company Name] [Email]\n\nExample: /register John Doe ZASS Inc john@example.com`);
        return;
    }
    
    const name = parts[0] + ' ' + (parts[1] || '');
    const company = parts[2] || '';
    const email = parts[3] || '';
    
    const apiKey = 'zass_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    const paymentRef = 'REF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
        await db.run('INSERT INTO users (name, phone, email, company, api_key, payment_ref) VALUES (?, ?, ?, ?, ?, ?)',
            [name, from, email, company, apiKey, paymentRef]);
        
        await message.reply(`✅ *REGISTRATION SUCCESSFUL!*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🏢 Company: ${company}\n📧 Email: ${email}\n🔑 API Key: \`${apiKey}\`\n📋 Ref: ${paymentRef}\n━━━━━━━━━━━━━━━━━━━━\n\n💰 To upgrade to paid plan, type /pricing then /pay [plan]`);
    } catch (error) {
        await message.reply(`❌ Registration failed. Phone number may already be registered.`);
    }
}

// ==================== PAYMENT HANDLER ====================
async function handlePaymentRequest(message, from, plan) {
    const validPlans = ['pro', 'business', 'enterprise'];
    if (!validPlans.includes(plan.toLowerCase())) {
        await message.reply(`❌ Invalid plan. Available: pro, business, enterprise\n\nType /pricing to see details.`);
        return;
    }
    
    const prices = { pro: 49, business: 99, enterprise: 299 };
    const amount = prices[plan.toLowerCase()];
    const paymentRef = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    await db.run('INSERT INTO pending_payments (user_phone, amount, plan, payment_ref) VALUES (?, ?, ?, ?)',
        [from, amount, plan, paymentRef]);
    
    await message.reply(`💰 *PAYMENT REQUEST GENERATED* 💰\n\n━━━━━━━━━━━━━━━━━━━━\n📊 Plan: ${plan.toUpperCase()}\n💵 Amount: $${amount}\n📋 Reference: \`${paymentRef}\`\n━━━━━━━━━━━━━━━━━━━━\n\n🏦 *BANK DETAILS*\nBank: ${NMB_BANK}\nAccount: ${NMB_ACCOUNT_NAME}\nAccount No: \`${NMB_ACCOUNT}\`\nSWIFT: NMBLTZTZ\n\n━━━━━━━━━━━━━━━━━━━━\n📌 *Instructions:*\n1. Send $${amount} to NMB account\n2. Use reference: ${paymentRef}\n3. Type /status to check\n4. Admin will verify payment\n\n📧 Or email: ${CONTACT_EMAIL}`);
}

// ==================== VERIFICATION HANDLER (ADMIN) ====================
async function verifyPayment(message, paymentRef) {
    const payment = await db.get('SELECT * FROM pending_payments WHERE payment_ref = ?', [paymentRef]);
    if (!payment) {
        await message.reply(`❌ Payment reference ${paymentRef} not found.`);
        return;
    }
    
    // Update user payment status
    await db.run('UPDATE users SET payment_status = ?, plan = ? WHERE phone = ?', 
        ['active', payment.plan, payment.user_phone]);
    
    // Update payment status
    await db.run('UPDATE pending_payments SET status = ? WHERE payment_ref = ?', ['completed', paymentRef]);
    
    // Get user API key
    const user = await db.get('SELECT api_key, name FROM users WHERE phone = ?', [payment.user_phone]);
    
    await message.reply(`✅ *PAYMENT VERIFIED!*\n\n━━━━━━━━━━━━━━━━━━━━\n📊 Plan: ${payment.plan.toUpperCase()}\n💰 Amount: $${payment.amount}\n👤 User: ${user.name}\n🔑 API Key: \`${user.api_key}\`\n━━━━━━━━━━━━━━━━━━━━\n\n🎉 API key is now ACTIVE! User can start using the API.`);
    
    // Notify user
    const userClient = await whatsappClient.getChatById(payment.user_phone);
    if (userClient) {
        await whatsappClient.sendMessage(payment.user_phone, `✅ *PAYMENT CONFIRMED!*\n\nYour ${payment.plan.toUpperCase()} plan is now ACTIVE!\n🔑 Your API Key: \`${user.api_key}\`\n\nStart using: https://zass.website/dashboard`);
    }
}

// ==================== USER STATUS CHECKER ====================
async function checkUserStatus(message, from) {
    const user = await db.get('SELECT * FROM users WHERE phone = ?', [from]);
    if (!user) {
        await message.reply(`❌ You are not registered. Type /register to create an account.`);
        return;
    }
    
    const statusEmoji = user.payment_status === 'active' ? '✅' : '⏳';
    await message.reply(`📊 *ACCOUNT STATUS*\n\n━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${user.name}\n🏢 Company: ${user.company}\n📊 Plan: ${user.plan.toUpperCase()}\n💳 Payment: ${statusEmoji} ${user.payment_status.toUpperCase()}\n🔑 API Key: \`${user.api_key}\`\n\n━━━━━━━━━━━━━━━━━━━━\n${user.payment_status === 'active' ? '🎉 Your account is ACTIVE! Start using the API.' : '💰 Please complete payment to activate your account.'}`);
}

// ==================== GET API KEY ====================
async function getAPIKey(message, from) {
    const user = await db.get('SELECT api_key, payment_status FROM users WHERE phone = ?', [from]);
    if (!user) {
        await message.reply(`❌ You are not registered. Type /register to create an account.`);
        return;
    }
    
    if (user.payment_status !== 'active') {
        await message.reply(`⏳ Your account is PENDING. Complete payment to get your API key.\n\nType /pricing then /pay [plan] to upgrade.`);
        return;
    }
    
    await message.reply(`🔑 *YOUR API KEY*\n\n\`${user.api_key}\`\n\n📌 Keep this key secure. It provides full access to your account.`);
}

// ==================== ADMIN FUNCTIONS ====================
async function listPendingPayments(message) {
    const payments = await db.all('SELECT * FROM pending_payments WHERE status = "pending"');
    if (payments.length === 0) {
        await message.reply(`📭 No pending payments.`);
        return;
    }
    
    let reply = `💰 *PENDING PAYMENTS* (${payments.length})\n\n━━━━━━━━━━━━━━━━━━━━\n`;
    for (const p of payments) {
        reply += `📋 Ref: ${p.payment_ref}\n👤 Phone: ${p.user_phone}\n📊 Plan: ${p.plan}\n💰 Amount: $${p.amount}\n📅 Date: ${p.created_at}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
    reply += `\nTo verify: /verify [reference]`;
    await message.reply(reply);
}

async function listAllUsers(message) {
    const users = await db.all('SELECT * FROM users');
    let reply = `👥 *ALL USERS* (${users.length})\n\n━━━━━━━━━━━━━━━━━━━━\n`;
    for (const u of users) {
        reply += `👤 ${u.name}\n📞 ${u.phone}\n🏢 ${u.company}\n📊 ${u.plan} - ${u.payment_status}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
    await message.reply(reply);
}

async function getBotStats(message) {
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const paymentCount = await db.get('SELECT COUNT(*) as count FROM pending_payments WHERE status = "pending"');
    const convCount = await db.get('SELECT COUNT(*) as count FROM conversations');
    
    await message.reply(`📊 *BOT STATISTICS*\n\n━━━━━━━━━━━━━━━━━━━━\n👥 Total Users: ${userCount.count}\n💰 Pending Payments: ${paymentCount.count}\n💬 Conversations: ${convCount.count}\n🤖 Status: ONLINE\n📱 WhatsApp: ${isWhatsAppReady ? 'CONNECTED' : 'CONNECTING'}\n\n━━━━━━━━━━━━━━━━━━━━\n🕐 Uptime: 24/7`);
}

async function activateUser(message, phone) {
    await db.run('UPDATE users SET payment_status = ? WHERE phone = ?', ['active', phone]);
    await message.reply(`✅ User ${phone} has been ACTIVATED!`);
}

// ==================== WEB SOCKET (REAL-TIME WEB CHAT) ====================
io.on('connection', (socket) => {
    console.log('🟢 Web client connected');
    
    socket.on('chat-message', async (data) => {
        const { message, userId } = data;
        
        try {
            const aiResponse = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
                contents: [{ parts: [{ text: `You are ZASS AI Assistant. Respond to: ${message}` }] }]
            });
            const reply = aiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || getSmartReply(message);
            socket.emit('bot-response', { response: reply });
        } catch (error) {
            socket.emit('bot-response', { response: getSmartReply(message) });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔴 Web client disconnected');
    });
});

// ==================== START BOT ====================
async function startBot() {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🤖 ZASS ENTERPRISE AI BOT - 24/7 AUTOMATION                        ║
║   ===============================================                    ║
║                                                                      ║
║   📱 WhatsApp: Starting...                                          ║
║   🌐 WebSocket: Running on port ${PORT}                               ║
║   🔑 Admin Password: ${ADMIN_PASSWORD}                                ║
║                                                                      ║
║   ✅ Features:                                                       ║
║   • Automatic Payment Verification                                  ║
║   • AI Chat (Gemini)                                                ║
║   • User Registration                                               ║
║   • API Key Management                                              ║
║   • Real-time Web Chat                                              ║
║   • Admin Dashboard                                                 ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    `);
    
    await initDatabase();
    
    // Start WhatsApp client
    whatsappClient.initialize();
    
    // Start WebSocket server
    server.listen(PORT, () => {
        console.log(`✅ WebSocket server running on port ${PORT}`);
        console.log(`📱 WhatsApp Bot is starting... Scan QR code when prompted`);
    });
}

startBot();
