// server.js - ZASS AI AGENT with Voice, Screen Share, Daily Routine
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const multer = require('multer');
const schedule = require('node-schedule');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const GEMINI_API_KEY = 'AIzaSyAgzX8szyUGq2TxCoUgAJx7U-z4FSgiLP8';
const CONTACT_EMAIL = 'citytechuk@gmail.com';
const CONTACT_PHONE = '+25576323348';

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('.'));
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

// ==================== DIRECTORY SETUP ====================
['uploads', 'screenshots', 'daily_tasks', 'logs'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ==================== DAILY ROUTINES STORAGE ====================
let dailyRoutines = [];
let scheduledJobs = [];

// ==================== AI FUNCTIONS ====================
async function callGemini(prompt, imageData = null) {
    try {
        let body;
        if (imageData) {
            body = {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/png", data: imageData } }
                    ]
                }]
            };
        } else {
            body = {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            };
        }
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "I understand. How can I help you?";
    } catch (error) {
        console.error('AI Error:', error);
        return "I'm having trouble connecting. Please try again.";
    }
}

// ==================== COMMAND EXECUTION ====================
async function executeCommand(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            resolve({ success: !error, output: stdout || stderr, error: error?.message });
        });
    });
}

// ==================== DAILY ROUTINES ====================
function setupDailyRoutines() {
    // Morning routine - 8:00 AM
    schedule.scheduleJob('0 8 * * *', async () => {
        console.log('🌅 Morning routine starting...');
        const result = await callGemini("Give me a motivational quote and today's summary for ZASS Enterprise.");
        fs.appendFileSync('logs/daily.log', `[${new Date()}] MORNING: ${result}\n`);
    });
    
    // Midday check - 12:00 PM
    schedule.scheduleJob('0 12 * * *', async () => {
        console.log('☀️ Midday check...');
        const result = await callGemini("Provide a midday productivity tip for the team.");
        fs.appendFileSync('logs/daily.log', `[${new Date()}] MIDDAY: ${result}\n`);
    });
    
    // Evening report - 5:00 PM
    schedule.scheduleJob('0 17 * * *', async () => {
        console.log('🌙 Evening report...');
        const result = await callGemini("Generate an end-of-day summary report for ZASS Enterprise.");
        fs.appendFileSync('logs/daily.log', `[${new Date()}] EVENING: ${result}\n`);
    });
    
    console.log('✅ Daily routines scheduled');
}

// ==================== API ENDPOINTS ====================

// Voice chat endpoint
app.post('/api/voice-chat', async (req, res) => {
    const { text, image } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });
    
    const response = await callGemini(text, image);
    res.json({ success: true, response });
});

// Screen share analysis
app.post('/api/screen-share', upload.single('screenshot'), async (req, res) => {
    const { question } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Screenshot required' });
    
    const imageBuffer = req.file.buffer || fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');
    
    const prompt = question || "Analyze this screen and tell me what you see. Describe everything important.";
    const response = await callGemini(prompt, base64Image);
    
    fs.unlinkSync(req.file.path);
    res.json({ success: true, response });
});

// Daily routine management
app.post('/api/daily-routine', async (req, res) => {
    const { task, time, action } = req.body;
    
    if (action === 'add') {
        dailyRoutines.push({ task, time, created: Date.now() });
        
        // Schedule the task
        const [hour, minute] = time.split(':');
        const job = schedule.scheduleJob(`${minute} ${hour} * * *`, async () => {
            console.log(`📋 Executing daily task: ${task}`);
            const result = await callGemini(`Execute this task: ${task}`);
            fs.appendFileSync('logs/tasks.log', `[${new Date()}] TASK: ${task}\nRESULT: ${result}\n\n`);
        });
        scheduledJobs.push(job);
        
        res.json({ success: true, message: `Task scheduled for ${time}`, tasks: dailyRoutines });
    } else {
        res.json({ success: true, tasks: dailyRoutines });
    }
});

// Execute any command
app.post('/api/execute', async (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });
    
    const result = await executeCommand(command);
    res.json(result);
});

// Deploy to Heroku
app.post('/api/deploy', async (req, res) => {
    const { repoUrl, appName } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'Repository URL required' });
    
    try {
        await executeCommand(`git clone ${repoUrl} temp-deploy`);
        await executeCommand(`cd temp-deploy && heroku create ${appName || 'zass-app-' + Date.now()} --region eu`);
        await executeCommand(`cd temp-deploy && git push heroku main`);
        await executeCommand(`rm -rf temp-deploy`);
        res.json({ success: true, message: 'Deployed successfully' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), routines: dailyRoutines.length });
});

// ==================== FRONTEND (Voice + Screen Share + Daily Routine) ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== START SERVER ====================
setupDailyRoutines();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🎤 ZASS AI AGENT - VOICE + SCREEN SHARE + DAILY ROUTINE           ║
║   ============================================================       ║
║                                                                      ║
║   ✅ Voice Chat: Active                                              ║
║   ✅ Screen Share: Active                                            ║
║   ✅ Daily Routines: Active (8AM, 12PM, 5PM)                        ║
║   ✅ Gemini AI: Active                                               ║
║                                                                      ║
║   📱 URL: https://your-app.herokuapp.com                             ║
║   🎤 Click microphone to speak with AI                               ║
║   📸 Share screen to get AI analysis                                 ║
║   ⏰ Set daily routines for automatic tasks                          ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    `);
});
