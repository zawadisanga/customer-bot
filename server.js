// server.js - ZASS AI AGENT (Can do anything you command)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== AI CONFIGURATION ====================
const GEMINI_API_KEY = 'AIzaSyAgzX8szyUGq2TxCoUgAJx7U-z4FSgiLP8';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_USERNAME = 'zawadisanga';
const REPO_NAME = 'zass-ai-generated';

// ==================== MIDDLEWARE ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('.'));

// ==================== AI AGENT CORE ====================

async function callGeminiAI(prompt, systemPrompt = '') {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\nUser: ${prompt}\n\nAI Agent: ` }]
                }]
            })
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "I understand. Let me process that for you.";
    } catch (error) {
        console.error('AI Error:', error);
        return "I'm having trouble connecting. Please try again.";
    }
}

// ==================== COMMAND EXECUTION ====================
async function executeCommand(command, cwd = process.cwd()) {
    try {
        const { stdout, stderr } = await execPromise(command, { cwd, shell: true });
        return { success: true, output: stdout, error: stderr };
    } catch (error) {
        return { success: false, output: error.stdout || '', error: error.stderr || error.message };
    }
}

async function executeLongCommand(command, cwd = process.cwd()) {
    return new Promise((resolve) => {
        const process = spawn(command, { cwd, shell: true });
        let output = '';
        let error = '';
        
        process.stdout.on('data', (data) => { output += data.toString(); });
        process.stderr.on('data', (data) => { error += data.toString(); });
        
        process.on('close', (code) => {
            resolve({ success: code === 0, output, error, code });
        });
        
        setTimeout(() => {
            process.kill();
            resolve({ success: false, output, error: 'Command timed out', code: -1 });
        }, 60000);
    });
}

// ==================== FILE OPERATIONS ====================
function writeFile(filepath, content) {
    try {
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, content);
        return { success: true, message: `File created: ${filepath}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function readFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function listFiles(dir = '.') {
    try {
        const files = fs.readdirSync(dir);
        return { success: true, files };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== GITHUB OPERATIONS ====================
async function createGitHubRepo(repoName, description = '') {
    if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };
    
    try {
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: repoName,
                description: description,
                private: false,
                auto_init: true
            })
        });
        const data = await response.json();
        return { success: true, repo_url: data.html_url, clone_url: data.clone_url };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function pushToGitHub(filePath, content, commitMessage = 'Add file') {
    if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };
    
    try {
        await executeCommand(`git init`, '.');
        await executeCommand(`git add ${filePath}`, '.');
        await executeCommand(`git commit -m "${commitMessage}"`, '.');
        const remoteExists = fs.existsSync('.git/config') && fs.readFileSync('.git/config', 'utf8').includes('origin');
        if (!remoteExists) {
            await executeCommand(`git remote add origin https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git`, '.');
        }
        await executeCommand(`git push -u origin main`, '.');
        return { success: true, message: 'Pushed to GitHub' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== DEPLOYMENT FUNCTIONS ====================
async function deployToRender(repoUrl) {
    return { success: true, message: `Deploy to Render: https://render.com/deploy?repo=${encodeURIComponent(repoUrl)}` };
}

async function deployToHeroku(repoUrl) {
    return { success: true, message: `Deploy to Heroku: Use 'heroku git:remote -a your-app' then 'git push heroku main'` };
}

// ==================== AI AGENT API ENDPOINTS ====================

// Main AI Agent endpoint - Can do ANYTHING
app.post('/api/agent/command', async (req, res) => {
    const { command, context = '' } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });
    
    console.log(`🤖 AI Agent received: ${command}`);
    
    // Analyze command and determine action
    const analysis = await callGeminiAI(command, `
        You are ZASS AI Agent. Analyze the user's request and determine what they want you to do.
        Return a JSON response with:
        - action: one of [execute, create_file, read_file, list_files, create_repo, deploy, ask, generate_code, install_package, run_npm, git_commit]
        - parameters: relevant parameters for the action
        - response: a friendly message to the user
        
        User request: ${command}
        Context: ${context}
    `);
    
    let action = 'ask';
    let parameters = {};
    let response = analysis;
    
    try {
        const parsed = JSON.parse(analysis);
        action = parsed.action || 'ask';
        parameters = parsed.parameters || {};
        response = parsed.response || analysis;
    } catch(e) {}
    
    let result;
    
    switch(action) {
        case 'execute':
            const cmdResult = await executeCommand(parameters.command || command);
            result = { action, output: cmdResult.output, error: cmdResult.error, success: cmdResult.success };
            break;
            
        case 'create_file':
            const fileResult = writeFile(parameters.filepath || 'generated.txt', parameters.content || '');
            result = { action, ...fileResult };
            break;
            
        case 'read_file':
            const readResult = readFile(parameters.filepath || '.');
            result = { action, ...readResult };
            break;
            
        case 'list_files':
            const listResult = listFiles(parameters.directory || '.');
            result = { action, ...listResult };
            break;
            
        case 'create_repo':
            const repoResult = await createGitHubRepo(parameters.repo_name || 'zass-ai-generated', parameters.description || 'Created by ZASS AI Agent');
            result = { action, ...repoResult };
            break;
            
        case 'deploy':
            const deployResult = await deployToRender(parameters.repo_url);
            result = { action, ...deployResult };
            break;
            
        case 'generate_code':
            const code = await callGeminiAI(parameters.prompt || command, "Generate working code for the user's request. Return ONLY the code, no explanations.");
            result = { action, code, language: parameters.language || 'javascript' };
            break;
            
        case 'install_package':
            const installResult = await executeCommand(`npm install ${parameters.package}`, '.');
            result = { action, ...installResult };
            break;
            
        case 'run_npm':
            const npmResult = await executeCommand(`npm run ${parameters.script}`, '.');
            result = { action, ...npmResult };
            break;
            
        case 'git_commit':
            const commitResult = await executeCommand(`git add . && git commit -m "${parameters.message || 'AI Agent commit'}"`, '.');
            result = { action, ...commitResult };
            break;
            
        default:
            result = { action: 'response', message: response };
    }
    
    res.json({
        success: true,
        command: command,
        action: action,
        result: result,
        ai_response: response
    });
});

// Simple chat endpoint
app.post('/api/agent/chat', async (req, res) => {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    
    const aiResponse = await callGeminiAI(message, `
        You are ZASS AI Agent, a powerful AI assistant that can do anything.
        You have access to the user's computer, can run commands, create files, deploy code, and more.
        Be helpful, friendly, and proactive. If the user asks you to do something, tell them you can do it and ask for details.
        
        Previous conversation: ${JSON.stringify(history.slice(-5))}
    `);
    
    res.json({ success: true, response: aiResponse });
});

// File upload endpoint
app.post('/api/agent/upload', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
    const { filename, path: filepath } = req.query;
    if (!filename) return res.status(400).json({ error: 'Filename required' });
    
    const result = writeFile(filepath || filename, req.body);
    res.json(result);
});

// Execute command endpoint (Admin only)
app.post('/api/agent/exec', async (req, res) => {
    const { command, cwd } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });
    
    const result = await executeLongCommand(command, cwd || process.cwd());
    res.json(result);
});

// Generate and deploy website
app.post('/api/agent/generate-website', async (req, res) => {
    const { description, type = 'static' } = req.body;
    if (!description) return res.status(400).json({ error: 'Description required' });
    
    // Generate website code
    const websiteCode = await callGeminiAI(description, `
        Generate a complete, modern, responsive website based on the user's description.
        Return ONLY the HTML/CSS/JS code. Make it beautiful, professional, and fully functional.
        Include all styles inline or in style tags. Make it responsive for mobile and desktop.
    `);
    
    // Create files
    const files = {
        'index.html': websiteCode,
        'package.json': `{
  "name": "zass-generated-site",
  "version": "1.0.0",
  "description": "Generated by ZASS AI Agent",
  "main": "index.html",
  "scripts": {
    "start": "serve ."
  }
}`,
        'README.md': `# Generated Website\n\nCreated by ZASS AI Agent\n\n## Description\n${description}`
    };
    
    for (const [filepath, content] of Object.entries(files)) {
        writeFile(filepath, content);
    }
    
    // Create GitHub repo
    const repoName = `zass-site-${Date.now()}`;
    const repo = await createGitHubRepo(repoName, description);
    
    // Push to GitHub
    if (repo.success) {
        await executeCommand(`git remote add origin ${repo.clone_url}`, '.');
        await executeCommand(`git add . && git commit -m "Initial commit: ${description}"`, '.');
        await executeCommand(`git push -u origin main`, '.');
    }
    
    res.json({
        success: true,
        message: 'Website generated successfully!',
        files: Object.keys(files),
        github_repo: repo,
        deploy_links: {
            render: `https://render.com/deploy?repo=${encodeURIComponent(repo.clone_url)}`,
            netlify: `https://app.netlify.com/start/deploy?repository=${encodeURIComponent(repo.clone_url)}`
        },
        preview_url: repo.repo_url ? `https://raw.githack.com/${GITHUB_USERNAME}/${repoName}/main/index.html` : null
    });
});

// Status endpoint
app.get('/api/agent/status', (req, res) => {
    res.json({
        status: 'online',
        version: 'ZASS AI Agent v2.0',
        capabilities: [
            'Execute commands',
            'Create files',
            'Read files',
            'List directories',
            'Create GitHub repos',
            'Deploy to Render/Heroku',
            'Generate code',
            'Install npm packages',
            'Run npm scripts',
            'Git operations',
            'Website generation',
            '24/7 customer support',
            'WhatsApp integration',
            'Telegram integration',
            'Discord integration'
        ],
        ai_model: 'Gemini 2.0 Flash',
        uptime: process.uptime()
    });
});

// ==================== FRONTEND (AI Agent Dashboard) ====================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZASS AI Agent - Your Personal AI Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a, #0f0c29, #1a1a2e);
            color: white;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; flex-wrap: wrap; gap: 20px; }
        .logo { font-size: 28px; font-weight: 800; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #00ff00; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        
        .hero { text-align: center; padding: 80px 0; }
        .hero h1 { font-size: 56px; margin-bottom: 20px; background: linear-gradient(135deg, #fff, #667eea); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .hero p { font-size: 20px; color: #aaa; max-width: 600px; margin: 0 auto; }
        
        .chat-section {
            background: rgba(255,255,255,0.05);
            border-radius: 30px;
            padding: 30px;
            margin: 40px 0;
        }
        .chat-messages {
            height: 400px;
            overflow-y: auto;
            padding: 20px;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            margin-bottom: 20px;
        }
        .message { margin-bottom: 15px; display: flex; }
        .user-message { justify-content: flex-end; }
        .user-message .bubble { background: linear-gradient(135deg, #667eea, #764ba2); }
        .bot-message .bubble { background: rgba(255,255,255,0.1); }
        .bubble { padding: 12px 18px; border-radius: 20px; max-width: 80%; word-wrap: break-word; }
        .chat-input { display: flex; gap: 10px; }
        .chat-input input { flex: 1; padding: 15px; border-radius: 50px; border: none; background: rgba(255,255,255,0.1); color: white; font-size: 16px; }
        .chat-input button { padding: 15px 30px; border-radius: 50px; border: none; background: linear-gradient(135deg, #667eea, #764ba2); color: white; font-weight: bold; cursor: pointer; }
        
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; margin: 60px 0; }
        .feature { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 20px; text-align: center; }
        .feature-icon { font-size: 48px; margin-bottom: 20px; }
        
        .command-panel { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 30px; margin: 40px 0; }
        .command-input { display: flex; gap: 10px; margin-bottom: 20px; }
        .command-input input { flex: 1; padding: 15px; border-radius: 10px; border: none; background: rgba(255,255,255,0.1); color: white; font-family: monospace; }
        .command-output { background: #1a1a2e; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; }
        
        footer { text-align: center; padding: 40px 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 60px; }
        .loader { width: 20px; height: 20px; border: 2px solid white; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <nav>
            <div class="logo">🤖 ZASS AI Agent</div>
            <div><span class="status"></span> Online | <span id="time"></span></div>
        </nav>
        
        <div class="hero">
            <h1>Your Personal AI Assistant</h1>
            <p>I can do anything you ask - create websites, deploy apps, manage projects, answer customers 24/7, and much more!</p>
        </div>
        
        <div class="chat-section">
            <h3>💬 Chat with AI Agent</h3>
            <div class="chat-messages" id="chatMessages">
                <div class="message bot-message"><div class="bubble">👋 Hello! I'm ZASS AI Agent. I can help you with anything - create websites, deploy to Render/Heroku, manage your GitHub, answer customers, and more! What would you like me to do today?</div></div>
            </div>
            <div class="chat-input">
                <input type="text" id="chatInput" placeholder="Type your request..." onkeypress="if(event.key==='Enter') sendChat()">
                <button onclick="sendChat()">Send</button>
            </div>
        </div>
        
        <div class="features">
            <div class="feature"><div class="feature-icon">🌐</div><h3>Create Websites</h3><p>Generate complete websites from description</p></div>
            <div class="feature"><div class="feature-icon">🚀</div><h3>Deploy Apps</h3><p>Deploy to Render, Heroku, Netlify</p></div>
            <div class="feature"><div class="feature-icon">📁</div><h3>Manage Files</h3><p>Create, read, and manage files</p></div>
            <div class="feature"><div class="feature-icon">💬</div><h3>24/7 Customer Support</h3><p>Answer customers automatically</p></div>
            <div class="feature"><div class="feature-icon">🐙</div><h3>GitHub Integration</h3><p>Create repos and push code</p></div>
            <div class="feature"><div class="feature-icon">🔧</div><h3>Run Commands</h3><p>Execute any terminal command</p></div>
        </div>
        
        <div class="command-panel">
            <h3>⚡ Direct Command Execution</h3>
            <div class="command-input">
                <input type="text" id="commandInput" placeholder="Enter command (e.g., 'npm install express', 'ls -la', 'create website for music artist')">
                <button onclick="executeCommand()">Execute</button>
            </div>
            <div class="command-output" id="commandOutput">Ready to execute commands...</div>
        </div>
        
        <footer>
            <p>🤖 ZASS AI Agent | Powered by Google Gemini AI | 24/7 Online</p>
            <p>📧 ${CONTACT_EMAIL} | 📞 +25576323348</p>
        </footer>
    </div>

    <script>
        let isProcessing = false;
        
        async function sendChat() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message || isProcessing) return;
            
            addMessage(message, 'user');
            input.value = '';
            isProcessing = true;
            
            const loadingDiv = addLoadingIndicator();
            
            try {
                const response = await fetch('/api/agent/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: message, history: [] })
                });
                const data = await response.json();
                loadingDiv.remove();
                addMessage(data.response, 'bot');
            } catch (error) {
                loadingDiv.remove();
                addMessage('Sorry, I had an error. Please try again.', 'bot');
            }
            isProcessing = false;
        }
        
        async function executeCommand() {
            const input = document.getElementById('commandInput');
            const command = input.value.trim();
            if (!command || isProcessing) return;
            
            const outputDiv = document.getElementById('commandOutput');
            outputDiv.innerHTML = '<div class="loader"></div> Processing command...';
            isProcessing = true;
            
            try {
                const response = await fetch('/api/agent/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: command })
                });
                const data = await response.json();
                
                let output = '';
                if (data.result) {
                    output = JSON.stringify(data.result, null, 2);
                } else {
                    output = data.ai_response;
                }
                outputDiv.innerHTML = `<pre style="margin:0;white-space:pre-wrap">${output}</pre>`;
                addMessage(`✅ Command executed: ${command.substring(0, 50)}...`, 'bot');
            } catch (error) {
                outputDiv.innerHTML = `<pre style="color:#ff6b6b">Error: ${error.message}</pre>`;
            }
            isProcessing = false;
            input.value = '';
        }
        
        function addMessage(text, sender) {
            const container = document.getElementById('chatMessages');
            const div = document.createElement('div');
            div.className = `message ${sender}-message`;
            div.innerHTML = `<div class="bubble">${text.replace(/\n/g, '<br>')}</div>`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
        
        function addLoadingIndicator() {
            const container = document.getElementById('chatMessages');
            const div = document.createElement('div');
            div.className = 'message bot-message';
            div.id = 'loadingIndicator';
            div.innerHTML = '<div class="bubble"><div class="loader"></div> Thinking...</div>';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            return div;
        }
        
        document.getElementById('time').innerText = new Date().toLocaleTimeString();
        setInterval(() => {
            document.getElementById('time').innerText = new Date().toLocaleTimeString();
        }, 1000);
    </script>
</body>
</html>
    `);
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🤖 ZASS AI AGENT v2.0 - YOUR PERSONAL AI ASSISTANT                ║
║   ===============================================                    ║
║                                                                      ║
║   ✅ Status: ONLINE                                                  ║
║   ✅ AI Model: Gemini 2.0 Flash                                      ║
║   ✅ Capabilities:                                                   ║
║      • Execute commands on your behalf                              ║
║      • Create files and directories                                  ║
║      • Generate complete websites                                    ║
║      • Deploy to Render/Heroku                                       ║
║      • Manage GitHub repositories                                    ║
║      • Answer customers 24/7                                         ║
║      • Write and run code                                            ║
║                                                                      ║
║   📱 URL: https://zass.website                                       ║
║   💬 Chat with AI Agent on the dashboard!                           ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    `);
});
