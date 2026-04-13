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
        maxAge: 1000 * 60 * 60 * 24 * 7,
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
    res.redirect('/dashboard');
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
        
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        // Buscar status do bot na API do bot
        let botStatus = { botsOnline: 0, totalServidores: 0, totalUsuarios: 0, ping: 0 };
        try {
            const botRes = await fetch('https://y2k-nat.up.railway.app/api/bots', {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (botRes.ok) botStatus = await botRes.json();
        } catch (e) {
            console.log('Bot API offline');
        }
        
        res.render('dashboard', {
            user: req.user,
            guilds: adminGuilds,
            botStatus: botStatus,
            currentPage: 'dashboard',
            error: null
        });
    } catch (error) {
        res.render('dashboard', {
            user: req.user,
            guilds: [],
            botStatus: {},
            currentPage: 'dashboard',
            error: 'Erro ao carregar servidores'
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
            return res.render('error', { user: req.user, error: 'Sem permissão para este servidor.' });
        }
        
        // Buscar canais via API do bot
        let channels = [];
        let botConfig = { suggestionsChannel: null, receiveChannel: null };
        
        try {
            const chRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/channels`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (chRes.ok) channels = await chRes.json();
            
            const configRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/config`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (configRes.ok) botConfig = await configRes.json();
        } catch (e) {
            console.log('Erro ao buscar dados do bot');
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
        res.render('error', { user: req.user, error: 'Erro ao carregar configurações.' });
    }
});

// API: Salvar configurações
app.post('/api/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        const hasPermission = guilds.some(g => g.id === guildId && (g.permissions & 0x8) === 0x8);
        
        if (!hasPermission) {
            return res.status(403).json({ error: 'Sem permissão' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
    
    try {
        const botRes = await fetch(`https://y2k-nat.up.railway.app/api/guild/${guildId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_SECRET}`
            },
            body: JSON.stringify(req.body)
        });
        
        const data = await botRes.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// Rota 404
app.use((req, res) => {
    res.status(404).render('error', { user: req.user, error: 'Página não encontrada' });
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
╚══════════════════════════════════════════════════════════╝
    `);
});
