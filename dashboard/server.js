require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const DASHBOARD_PORT = process.env.PORT || 8080;

// ===== CONFIGURAÇÃO DA SESSÃO =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'dashboard_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
        secure: process.env.NODE_ENV === 'production'
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

// Middleware de autenticação
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
}

// ===== ROTAS =====

// Health Check para Railway
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        dashboard: 'online',
        timestamp: new Date().toISOString()
    });
});

// ⭐ PÁGINA INICIAL - CORRIGIDA ⭐
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>InsightBot | Dashboard</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Inter', sans-serif;
                    background: linear-gradient(135deg, #0a0a0c 0%, #141518 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .container {
                    text-align: center;
                    max-width: 500px;
                    padding: 50px 40px;
                    background: rgba(20, 21, 24, 0.95);
                    border: 1px solid rgba(88, 101, 242, 0.2);
                    border-radius: 32px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                }
                .logo {
                    margin-bottom: 30px;
                }
                .logo i {
                    font-size: 4rem;
                    color: #5865F2;
                    filter: drop-shadow(0 0 20px rgba(88, 101, 242, 0.4));
                }
                .logo h1 {
                    font-size: 2.2rem;
                    font-weight: 800;
                    font-family: 'Space Grotesk', sans-serif;
                    margin-top: 10px;
                }
                .logo span {
                    color: #5865F2;
                }
                .subtitle {
                    color: #b5b5b5;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    font-size: 0.85rem;
                    margin-bottom: 20px;
                }
                .description {
                    color: #6b6b6b;
                    margin-bottom: 35px;
                    font-size: 1rem;
                }
                .btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 16px 32px;
                    background: #5865F2;
                    color: white;
                    text-decoration: none;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 1.1rem;
                    transition: all 0.2s;
                    border: none;
                    cursor: pointer;
                }
                .btn:hover {
                    background: #4752C4;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(88, 101, 242, 0.3);
                }
                .links {
                    margin-top: 30px;
                    display: flex;
                    gap: 20px;
                    justify-content: center;
                }
                .links a {
                    color: #6b6b6b;
                    text-decoration: none;
                    font-size: 0.9rem;
                }
                .links a:hover {
                    color: #5865F2;
                }
                .footer {
                    margin-top: 40px;
                    color: #4a4a4a;
                    font-size: 0.85rem;
                }
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(35, 165, 90, 0.1);
                    border: 1px solid rgba(35, 165, 90, 0.3);
                    border-radius: 50px;
                    color: #23a55a;
                    font-size: 0.85rem;
                    margin-bottom: 25px;
                }
                .status-badge i {
                    font-size: 0.6rem;
                    animation: blink 1.5s ease-in-out infinite;
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">
                    <i class="fas fa-robot"></i>
                    <h1>Insight<span>Bot</span></h1>
                </div>
                <p class="subtitle">Painel de Controle</p>
                
                <div class="status-badge">
                    <i class="fas fa-circle"></i>
                    <span>SERVIDOR ONLINE</span>
                </div>
                
                <p class="description">Faça login com Discord para gerenciar seu bot</p>
                
                <a href="/login" class="btn">
                    <i class="fab fa-discord"></i>
                    Entrar com Discord
                </a>
                
                <div class="links">
                    <a href="/health"><i class="fas fa-heartbeat"></i> Health</a>
                    <a href="https://y2k-nat.up.railway.app" target="_blank"><i class="fas fa-external-link-alt"></i> Bot</a>
                </div>
                
                <div class="footer">
                    <p>InsightBot v2.1.0</p>
                    <p style="margin-top: 5px;">© 2026 - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Login
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('login', { user: req.user, error: null });
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
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// Dashboard principal
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        
        // Filtrar servidores onde o usuário é admin (permissão 0x8 = ADMINISTRATOR)
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        // Buscar status do bot
        let botStatus = { botsOnline: 0, totalServidores: 0, totalUsuarios: 0, ping: 0 };
        try {
            const botRes = await fetch('https://y2k-nat.up.railway.app/api/bots', {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}` }
            });
            if (botRes.ok) botStatus = await botRes.json();
        } catch (e) {
            console.log('Bot API offline, usando dados padrão');
        }
        
        res.render('dashboard', {
            user: req.user,
            guilds: adminGuilds,
            botStatus: botStatus,
            currentPage: 'dashboard',
            error: null
        });
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.render('dashboard', {
            user: req.user,
            guilds: [],
            botStatus: { botsOnline: 0, totalServidores: 0, totalUsuarios: 0, ping: 0 },
            currentPage: 'dashboard',
            error: 'Erro ao carregar servidores. Tente novamente.'
        });
    }
});

// Dashboard de servidor específico
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        const hasPermission = adminGuilds.some(g => g.id === guildId);
        if (!hasPermission) {
            return res.render('error', { user: req.user, error: 'Você não tem permissão para gerenciar este servidor.' });
        }
        
        // Buscar canais do servidor (do bot)
        let channels = [];
        let botConfig = { suggestionsChannel: null, receiveChannel: null };
        
        try {
            const chRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/channels`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}` }
            });
            if (chRes.ok) channels = await chRes.json();
            
            const configRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/config`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}` }
            });
            if (configRes.ok) botConfig = await configRes.json();
        } catch (e) {
            console.log('Erro ao buscar dados do bot:', e.message);
        }
        
        res.render('guild-dashboard', {
            user: req.user,
            guilds: adminGuilds,
            selectedGuild: guildId,
            channels: channels,
            botConfig: botConfig,
            currentPage: 'guild'
        });
    } catch (error) {
        console.error('Erro ao carregar servidor:', error);
        res.render('error', { user: req.user, error: 'Erro ao carregar configurações do servidor.' });
    }
});

// API: Salvar configurações
app.post('/api/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    // Verificar permissão
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        const hasPermission = guilds.some(g => g.id === guildId && (g.permissions & 0x8) === 0x8);
        
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão para este servidor' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
    
    try {
        const botRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}`
            },
            body: JSON.stringify(req.body)
        });
        
        const data = await botRes.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// Rota 404
app.use((req, res) => {
    res.status(404).render('error', { 
        user: req.user, 
        error: 'Página não encontrada' 
    });
});

// Iniciar servidor
app.listen(DASHBOARD_PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║         🎛️  INSIGHTBOT DASHBOARD INICIADA  🎛️           ║
╠══════════════════════════════════════════════════════════╣
║  📡 Dashboard: http://localhost:${DASHBOARD_PORT}
║  🔐 OAuth2 configurado
║  🤖 Conectado ao bot: https://y2k-nat.up.railway.app
║  ❤️  Health Check: http://localhost:${DASHBOARD_PORT}/health
╚══════════════════════════════════════════════════════════╝
    `);
});
