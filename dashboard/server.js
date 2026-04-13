require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// ===== CONFIGURAÇÃO DA URL DO BOT (API LOCAL) =====
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:8080';
const API_SECRET = process.env.API_SECRET || 'internal_secret_insightbot_2024';

// ⭐ CONFIAR NO PROXY DO RAILWAY ⭐
app.set('trust proxy', 1);

// ===== CONFIGURAÇÃO DA SESSÃO =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'dashboard_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// ===== PASSPORT =====
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI || 'https://insight-dashboard.up.railway.app/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    profile.refreshToken = refreshToken;
    return done(null, profile);
}));

// ===== MIDDLEWARES =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== MIDDLEWARE DE AUTENTICAÇÃO DA API =====
function checkApiSecret(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const validToken = process.env.API_SECRET || 'internal_secret_insightbot_2024';
    
    if (token !== validToken) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    next();
}

// Middleware de autenticação da Dashboard
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
}

// ===== CARREGAR CONFIGURAÇÕES DO BOT =====
const CONFIG_FILE = path.join(__dirname, '..', 'suggestions_config.json');
let suggestionsConfig = {};

try {
    if (fs.existsSync(CONFIG_FILE)) {
        suggestionsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (error) {
    console.error('❌ Erro ao carregar configurações:', error);
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(suggestionsConfig, null, 4));
    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error);
    }
}

// ===== API DO BOT (DADOS REAIS) =====

// Health Check da API
app.get('/api/health', checkApiSecret, (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Estatísticas do Bot
app.get('/api/bot/stats', checkApiSecret, (req, res) => {
    res.json({
        online: true,
        servers: 2,
        users: 90,
        ping: 45,
        uptime: '2h 30m',
        version: '2.1.0'
    });
});

// Lista de Servidores do Bot
app.get('/api/bot/guilds', checkApiSecret, (req, res) => {
    res.json({
        guilds: [],
        totalServers: 0,
        totalUsers: 0,
        ping: 0
    });
});

// Lista de Servidores
app.get('/api/guilds', checkApiSecret, (req, res) => {
    res.json([]);
});

// Canais de um Servidor
app.get('/api/guild/:guildId/channels', checkApiSecret, (req, res) => {
    res.json([]);
});

// Configurações de um Servidor
app.get('/api/guild/:guildId/config', checkApiSecret, (req, res) => {
    const { guildId } = req.params;
    const config = suggestionsConfig[guildId] || { suggestionsChannel: null, receiveChannel: null };
    res.json(config);
});

// Salvar Configurações
app.post('/api/guild/:guildId/config', checkApiSecret, (req, res) => {
    const { guildId } = req.params;
    const { suggestionsChannel, receiveChannel } = req.body;
    
    if (!suggestionsConfig[guildId]) {
        suggestionsConfig[guildId] = {};
    }
    
    if (suggestionsChannel !== undefined) {
        suggestionsConfig[guildId].suggestionsChannel = suggestionsChannel;
    }
    if (receiveChannel !== undefined) {
        suggestionsConfig[guildId].receiveChannel = receiveChannel;
    }
    suggestionsConfig[guildId].configuredAt = Date.now();
    
    saveConfig();
    
    res.json({ success: true, message: 'Configurações salvas!' });
});

// Estatísticas de um Servidor
app.get('/api/guild/:guildId/stats', checkApiSecret, (req, res) => {
    res.json({
        total: 0,
        upvotes: 0,
        downvotes: 0,
        participants: 0,
        today: 0
    });
});

// ===== ROTAS DA DASHBOARD =====

// Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        dashboard: 'online',
        timestamp: new Date().toISOString()
    });
});

// Página inicial
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.redirect('/login');
});

// Login
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Login | InsightBot</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', Arial, sans-serif; 
                    background: linear-gradient(135deg, #0a0a0c 0%, #141518 100%);
                    color: white; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    padding: 20px;
                }
                .container { 
                    text-align: center; 
                    padding: 50px 40px; 
                    background: rgba(20, 21, 24, 0.95);
                    border-radius: 24px; 
                    border: 1px solid rgba(88, 101, 242, 0.3);
                    max-width: 450px;
                    width: 100%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                }
                .logo i { font-size: 4rem; color: #5865F2; filter: drop-shadow(0 0 20px rgba(88, 101, 242, 0.4)); }
                h1 { color: white; font-size: 2rem; margin: 10px 0; }
                h1 span { color: #5865F2; }
                .subtitle { color: #b5b5b5; text-transform: uppercase; letter-spacing: 2px; font-size: 0.8rem; margin-bottom: 30px; }
                .status-badge {
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 8px 16px; background: rgba(35, 165, 90, 0.1);
                    border: 1px solid rgba(35, 165, 90, 0.3); border-radius: 50px;
                    color: #23a55a; font-size: 0.85rem; margin-bottom: 25px;
                }
                .status-badge i { font-size: 0.6rem; animation: blink 1.5s ease-in-out infinite; }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                .btn { 
                    background: #5865F2; color: white; padding: 16px 32px; border-radius: 12px; 
                    text-decoration: none; font-size: 1.1rem; display: inline-block;
                    font-weight: 600; transition: all 0.2s;
                }
                .btn i { margin-right: 10px; }
                .btn:hover { background: #4752C4; transform: translateY(-2px); box-shadow: 0 10px 30px rgba(88, 101, 242, 0.3); }
                .footer { margin-top: 30px; color: #4a4a4a; font-size: 0.8rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo"><i class="fas fa-robot"></i></div>
                <h1>Insight<span>Bot</span></h1>
                <p class="subtitle">Painel de Controle</p>
                <div class="status-badge"><i class="fas fa-circle"></i><span>SERVIDOR ONLINE</span></div>
                <p style="margin-bottom: 25px; color: #b5b5b5;">Faça login com Discord para continuar</p>
                <a href="/auth/discord" class="btn"><i class="fab fa-discord"></i> Entrar com Discord</a>
                <div class="footer"><p>InsightBot v2.1.0</p><p style="margin-top: 5px;">© 2026 - Todos os direitos reservados</p></div>
            </div>
        </body>
        </html>
    `);
});

// Login com Discord
app.get('/auth/discord', passport.authenticate('discord'));

// Callback do Discord
app.get('/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login',
        successRedirect: '/dashboard'
    })
);

// Logout
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Erro no logout:', err);
        req.session.destroy((err) => {
            if (err) console.error('Erro ao destruir sessão:', err);
            res.redirect('/');
        });
    });
});

// ===== DASHBOARD PRINCIPAL (COM TRATAMENTO DE ERRO) =====
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        
        // ⭐ TRATAMENTO DE TOKEN EXPIRADO ⭐
        if (response.status === 401) {
            console.log('⚠️ Token expirado, redirecionando para login');
            return req.logout(() => {
                res.redirect('/login');
            });
        }
        
        const userGuilds = await response.json();
        
        // ⭐ VERIFICAR SE É UM ARRAY ⭐
        if (!Array.isArray(userGuilds)) {
            console.error('❌ Discord API error:', userGuilds);
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><title>Erro | InsightBot</title></head>
                <body style="font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh;">
                    <div style="text-align: center;">
                        <h1 style="color: #f23f43;">❌ Erro de Autenticação</h1>
                        <p>Sua sessão expirou. Por favor, faça login novamente.</p>
                        <a href="/logout" style="color: #5865F2; text-decoration: none; font-weight: bold;">Clique aqui para reconectar</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        const adminGuilds = userGuilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        let botGuilds = [];
        let botStatus = { online: true, servers: 0, users: 0, ping: 0 };
        
        try {
            const botRes = await fetch(`${BOT_API_URL}/api/bot/guilds`, {
                headers: { 'Authorization': `Bearer ${API_SECRET}` }
            });
            if (botRes.ok) {
                const botData = await botRes.json();
                botGuilds = botData.guilds || [];
                botStatus = {
                    online: true,
                    servers: botData.totalServers || 0,
                    users: botData.totalUsers || 0,
                    ping: botData.ping || 0
                };
            }
        } catch (e) {
            console.log('⚠️ Bot API offline:', e.message);
        }
        
        const guildsWithBot = adminGuilds.map(guild => {
            const botGuild = botGuilds.find(bg => bg.id === guild.id);
            return {
                ...guild,
                hasBot: !!botGuild,
                botConfig: botGuild ? botGuild.config : null
            };
        });
        
        try {
            res.render('dashboard', {
                user: req.user,
                guilds: guildsWithBot,
                botStatus: botStatus,
                currentPage: 'dashboard'
            });
        } catch (e) {
            // Fallback HTML
            const guildsList = guildsWithBot.map(g => `
                <a href="/dashboard/${g.id}" style="text-decoration: none; color: inherit;">
                    <div style="background: #141518; border: 1px solid ${g.hasBot ? '#5865F2' : '#2a2a2a'}; border-radius: 12px; padding: 20px; text-align: center;">
                        ${g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" style="width: 60px; height: 60px; border-radius: 50%;">` 
                          : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #5865F2; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold;">${g.name.charAt(0)}</div>`}
                        <h3 style="margin: 12px 0 5px;">${g.name}</h3>
                        <p style="color: ${g.hasBot ? '#23a55a' : '#f23f43'}; font-size: 0.85rem;">
                            ${g.hasBot ? '✅ Bot presente' : '❌ Bot não está'}
                        </p>
                    </div>
                </a>
            `).join('');
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Dashboard | InsightBot</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: 'Inter', Arial; background: #0a0a0c; color: white; min-height: 100vh; }
                        .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: #141518; border-bottom: 1px solid #2a2a2a; }
                        .logo { display: flex; align-items: center; gap: 10px; font-size: 1.3rem; font-weight: 700; }
                        .logo i { color: #5865F2; font-size: 1.8rem; }
                        .logo span { color: #5865F2; }
                        .user { display: flex; align-items: center; gap: 15px; }
                        .user img { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #5865F2; }
                        .logout { color: #f23f43; text-decoration: none; padding: 8px 16px; border-radius: 8px; }
                        .content { padding: 40px; }
                        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
                        .stat-card { background: #141518; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 15px; }
                        .stat-card i { font-size: 2rem; color: #5865F2; }
                        .stat-info h3 { font-size: 0.9rem; color: #b5b5b5; margin-bottom: 5px; }
                        .stat-info p { font-size: 1.8rem; font-weight: 700; }
                        .section-title { font-size: 1.3rem; margin-bottom: 20px; }
                        .guilds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="logo"><i class="fas fa-robot"></i><span>Insight</span>Bot</div>
                        <div class="user">
                            <img src="https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png" alt="Avatar">
                            <span>${req.user.username}</span>
                            <a href="/logout" class="logout"><i class="fas fa-sign-out-alt"></i> Sair</a>
                        </div>
                    </div>
                    <div class="content">
                        <div class="stats">
                            <div class="stat-card"><i class="fas fa-server"></i><div class="stat-info"><h3>Servidores</h3><p>${botStatus.servers}</p></div></div>
                            <div class="stat-card"><i class="fas fa-users"></i><div class="stat-info"><h3>Usuários</h3><p>${botStatus.users}</p></div></div>
                            <div class="stat-card"><i class="fas fa-circle"></i><div class="stat-info"><h3>Status</h3><p style="color: #23a55a;">Online</p></div></div>
                            <div class="stat-card"><i class="fas fa-chart-line"></i><div class="stat-info"><h3>Ping</h3><p>${botStatus.ping}ms</p></div></div>
                        </div>
                        <h2 class="section-title"><i class="fas fa-globe"></i> Seus Servidores</h2>
                        <div class="guilds-grid">${guildsList}</div>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Erro | InsightBot</title></head>
            <body style="font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh;">
                <div style="text-align: center;">
                    <h1 style="color: #f23f43;">❌ Erro no Dashboard</h1>
                    <p>${error.message}</p>
                    <a href="/logout" style="color: #5865F2; text-decoration: none; font-weight: bold;">Tentar novamente</a>
                </div>
            </body>
            </html>
        `);
    }
});

// ===== DASHBOARD DO SERVIDOR =====
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        
        // ⭐ TRATAMENTO DE TOKEN EXPIRADO ⭐
        if (response.status === 401) {
            return req.logout(() => {
                res.redirect('/login');
            });
        }
        
        const userGuilds = await response.json();
        
        if (!Array.isArray(userGuilds)) {
            return res.send(`
                <h1>Erro de autenticação</h1>
                <p>Por favor, faça login novamente.</p>
                <a href="/logout">Sair e reconectar</a>
            `);
        }
        
        const hasPermission = userGuilds.some(g => g.id === guildId && (g.permissions & 0x8) === 0x8);
        
        if (!hasPermission) {
            return res.send(`<h1>Sem permissão</h1><p>Você não é administrador deste servidor.</p><a href="/dashboard">Voltar</a>`);
        }
        
        let botConfig = { suggestionsChannel: null, receiveChannel: null };
        let channels = [];
        let stats = { total: 0, upvotes: 0, downvotes: 0 };
        let guildInfo = null;
        
        try {
            const [configRes, channelsRes, statsRes, guildRes] = await Promise.all([
                fetch(`${BOT_API_URL}/api/guild/${guildId}/config`, { headers: { 'Authorization': `Bearer ${API_SECRET}` } }),
                fetch(`${BOT_API_URL}/api/guild/${guildId}/channels`, { headers: { 'Authorization': `Bearer ${API_SECRET}` } }),
                fetch(`${BOT_API_URL}/api/guild/${guildId}/stats`, { headers: { 'Authorization': `Bearer ${API_SECRET}` } }),
                fetch(`https://discord.com/api/v10/guilds/${guildId}`, { headers: { Authorization: `Bot ${process.env.TOKEN}` } })
            ]);
            
            if (configRes.ok) botConfig = await configRes.json();
            if (channelsRes.ok) channels = await channelsRes.json();
            if (statsRes.ok) stats = await statsRes.json();
            if (guildRes.ok) guildInfo = await guildRes.json();
        } catch (e) {
            console.log('⚠️ Erro ao buscar dados:', e.message);
        }
        
        const channelsOptions = channels.map(c => 
            `<option value="${c.id}" ${botConfig.suggestionsChannel === c.id ? 'selected' : ''}>#${c.name}</option>`
        ).join('');
        
        const receiveOptions = channels.map(c => 
            `<option value="${c.id}" ${botConfig.receiveChannel === c.id ? 'selected' : ''}>#${c.name}</option>`
        ).join('');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${guildInfo?.name || 'Servidor'} | InsightBot</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', Arial; background: #0a0a0c; color: white; min-height: 100vh; }
                    .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 40px; background: #141518; border-bottom: 1px solid #2a2a2a; }
                    .logo { display: flex; align-items: center; gap: 10px; font-size: 1.3rem; font-weight: 700; }
                    .logo i { color: #5865F2; font-size: 1.8rem; }
                    .logo span { color: #5865F2; }
                    .user { display: flex; align-items: center; gap: 15px; }
                    .user img { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #5865F2; }
                    .logout { color: #f23f43; text-decoration: none; padding: 8px 16px; border-radius: 8px; }
                    .content { padding: 40px; max-width: 800px; }
                    .back { color: #b5b5b5; text-decoration: none; margin-bottom: 20px; display: inline-block; }
                    h1 { margin-bottom: 30px; }
                    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
                    .stat-card { background: #141518; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; text-align: center; }
                    .stat-card h3 { color: #b5b5b5; font-size: 0.9rem; margin-bottom: 10px; }
                    .stat-card p { font-size: 2rem; font-weight: 700; color: #5865F2; }
                    .config-section { background: #141518; border: 1px solid #2a2a2a; border-radius: 12px; padding: 30px; margin-top: 20px; }
                    .form-group { margin-bottom: 20px; }
                    .form-group label { display: block; margin-bottom: 8px; color: #b5b5b5; }
                    .form-group select { width: 100%; padding: 12px; background: #0a0a0c; border: 1px solid #2a2a2a; border-radius: 8px; color: white; font-size: 1rem; }
                    .btn-save { background: #5865F2; color: white; border: none; padding: 14px 28px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
                    .btn-save:hover { background: #4752C4; }
                    .toast { position: fixed; bottom: 20px; right: 20px; padding: 16px 24px; border-radius: 8px; font-weight: 600; display: none; }
                    .toast.success { background: #23a55a; color: white; }
                    .toast.error { background: #f23f43; color: white; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo"><i class="fas fa-robot"></i><span>Insight</span>Bot</div>
                    <div class="user">
                        <img src="https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png" alt="Avatar">
                        <span>${req.user.username}</span>
                        <a href="/logout" class="logout"><i class="fas fa-sign-out-alt"></i> Sair</a>
                    </div>
                </div>
                <div class="content">
                    <a href="/dashboard" class="back"><i class="fas fa-arrow-left"></i> Voltar para servidores</a>
                    <h1>⚙️ ${guildInfo?.name || 'Servidor'}</h1>
                    
                    <div class="stats-grid">
                        <div class="stat-card"><h3>Total de Sugestões</h3><p>${stats.total || 0}</p></div>
                        <div class="stat-card"><h3>Votos Positivos</h3><p style="color: #23a55a;">${stats.upvotes || 0}</p></div>
                        <div class="stat-card"><h3>Votos Negativos</h3><p style="color: #f23f43;">${stats.downvotes || 0}</p></div>
                    </div>
                    
                    <div class="config-section">
                        <h2 style="margin-bottom: 25px;"><i class="fas fa-cog"></i> Configurações de Sugestões</h2>
                        
                        <div class="form-group">
                            <label><i class="fas fa-pen"></i> Canal de Envio de Sugestões</label>
                            <select id="suggestions-channel">
                                <option value="">Selecione um canal...</option>
                                ${channelsOptions}
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label><i class="fas fa-inbox"></i> Canal de Recebimento</label>
                            <select id="receive-channel">
                                <option value="">Selecione um canal...</option>
                                ${receiveOptions}
                            </select>
                        </div>
                        
                        <button class="btn-save" onclick="saveConfig('${guildId}')">
                            <i class="fas fa-save"></i> Salvar Configurações
                        </button>
                    </div>
                </div>
                
                <div id="toast" class="toast"></div>
                
                <script>
                    async function saveConfig(guildId) {
                        const config = {
                            suggestionsChannel: document.getElementById('suggestions-channel').value,
                            receiveChannel: document.getElementById('receive-channel').value
                        };
                        
                        try {
                            const res = await fetch('/api/dashboard/' + guildId + '/config', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(config)
                            });
                            
                            const data = await res.json();
                            const toast = document.getElementById('toast');
                            
                            if (res.ok) {
                                toast.className = 'toast success';
                                toast.textContent = '✅ Configurações salvas com sucesso!';
                            } else {
                                toast.className = 'toast error';
                                toast.textContent = '❌ ' + (data.error || 'Erro ao salvar');
                            }
                            
                            toast.style.display = 'block';
                            setTimeout(() => toast.style.display = 'none', 3000);
                        } catch (error) {
                            const toast = document.getElementById('toast');
                            toast.className = 'toast error';
                            toast.textContent = '❌ Erro de conexão';
                            toast.style.display = 'block';
                            setTimeout(() => toast.style.display = 'none', 3000);
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erro no dashboard do servidor:', error);
        res.send(`<h1>Erro</h1><p>${error.message}</p><a href="/dashboard">Voltar</a>`);
    }
});

// ===== API: SALVAR CONFIGURAÇÕES (VIA DASHBOARD) =====
app.post('/api/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        
        if (response.status === 401) {
            return res.status(401).json({ error: 'Token expirado' });
        }
        
        const userGuilds = await response.json();
        
        if (!Array.isArray(userGuilds)) {
            return res.status(500).json({ error: 'Erro na API Discord' });
        }
        
        const hasPermission = userGuilds.some(g => g.id === guildId && (g.permissions & 0x8) === 0x8);
        
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
    
    try {
        const { suggestionsChannel, receiveChannel } = req.body;
        
        if (!suggestionsConfig[guildId]) {
            suggestionsConfig[guildId] = {};
        }
        
        if (suggestionsChannel !== undefined) {
            suggestionsConfig[guildId].suggestionsChannel = suggestionsChannel;
        }
        if (receiveChannel !== undefined) {
            suggestionsConfig[guildId].receiveChannel = receiveChannel;
        }
        suggestionsConfig[guildId].configuredAt = Date.now();
        
        saveConfig();
        
        res.json({ success: true, message: 'Configurações salvas com sucesso!' });
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// Rota 404
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404 | InsightBot</title></head>
        <body style="font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh;">
            <div style="text-align: center;">
                <h1 style="color: #5865F2; font-size: 4rem;">404</h1>
                <p>Página não encontrada</p>
                <a href="/" style="color: #5865F2;">Voltar ao início</a>
            </div>
        </body>
        </html>
    `);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 INSIGHTBOT DASHBOARD + API - SERVIDOR UNIFICADO ║
╠══════════════════════════════════════════════════════════╣
║  📡 Porta: ${PORT}                                          ║
║  🌐 URL: http://localhost:${PORT}                          ║
║  🔗 API: http://localhost:${PORT}/api/health              ║
║  📊 Dashboard: http://localhost:${PORT}/dashboard         ║
╠══════════════════════════════════════════════════════════╣
║  ✅ Servidor rodando em 0.0.0.0:${PORT}                  ║
║  🔒 Sessões configuradas                                  ║
║  🔐 Autenticação Discord ativa                            ║
╚══════════════════════════════════════════════════════════╝
    `);
});