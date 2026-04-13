require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 4000;

// ===== CONFIGURAÇÃO DA SESSÃO =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'dashboard_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
    }
}));

// ===== PASSPORT =====
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI || 'http://localhost:4000/callback',
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
    res.redirect('/login');
}

// Middleware para verificar permissão no servidor
async function hasGuildPermission(userId, guildId) {
    try {
        const response = await fetch(`https://discord.com/api/v10/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${user.accessToken}` }
        });
        const guilds = await response.json();
        const guild = guilds.find(g => g.id === guildId);
        return guild && (guild.permissions & 0x8) === 0x8; // ADMINISTRATOR
    } catch (error) {
        return false;
    }
}

// ===== ROTAS =====

// Página inicial
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Login
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('login', { user: req.user });
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
        res.redirect('/');
    });
});

// ===== DASHBOARD =====

// Página principal da dashboard
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        
        // Filtrar servidores onde o usuário tem permissão de administrador
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        res.render('dashboard', {
            user: req.user,
            guilds: adminGuilds,
            selectedGuild: null,
            botGuilds: [], // Será preenchido via API
            error: null
        });
    } catch (error) {
        res.render('dashboard', {
            user: req.user,
            guilds: [],
            selectedGuild: null,
            botGuilds: [],
            error: 'Erro ao carregar servidores'
        });
    }
});

// Página de configuração de um servidor específico
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        // Verificar se usuário tem permissão
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        const hasPermission = adminGuilds.some(g => g.id === guildId);
        if (!hasPermission) {
            return res.status(403).render('error', {
                user: req.user,
                error: 'Você não tem permissão para gerenciar este servidor.'
            });
        }
        
        // Buscar configurações do bot para este servidor
        let botConfig = {};
        try {
            const configResponse = await fetch(`${process.env.API_URL}/api/bot/config/${guildId}`, {
                headers: { 'Authorization': `Bearer ${req.user.accessToken}` }
            });
            if (configResponse.ok) {
                botConfig = await configResponse.json();
            }
        } catch (error) {
            console.error('Erro ao buscar configurações:', error);
        }
        
        // Buscar canais do servidor (via API do bot)
        let channels = [];
        try {
            const channelsResponse = await fetch(`${process.env.API_URL}/api/bot/channels/${guildId}`, {
                headers: { 'Authorization': `Bearer ${req.user.accessToken}` }
            });
            if (channelsResponse.ok) {
                channels = await channelsResponse.json();
            }
        } catch (error) {
            console.error('Erro ao buscar canais:', error);
        }
        
        // Buscar estatísticas
        let stats = {};
        try {
            const statsResponse = await fetch(`${process.env.API_URL}/api/bot/stats/${guildId}`, {
                headers: { 'Authorization': `Bearer ${req.user.accessToken}` }
            });
            if (statsResponse.ok) {
                stats = await statsResponse.json();
            }
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
        }
        
        res.render('guild-dashboard', {
            user: req.user,
            guilds: adminGuilds,
            selectedGuild: guildId,
            botConfig: botConfig,
            channels: channels,
            stats: stats,
            error: null
        });
    } catch (error) {
        res.render('error', {
            user: req.user,
            error: 'Erro ao carregar configurações do servidor'
        });
    }
});

// ===== API ENDPOINTS =====

// Salvar configurações do servidor
app.post('/api/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    const config = req.body;
    
    // Verificar permissão
    if (!await hasGuildPermission(req.user.id, guildId)) {
        return res.status(403).json({ error: 'Sem permissão' });
    }
    
    try {
        // Salvar configurações via API do bot
        const response = await fetch(`${process.env.API_URL}/api/bot/config/${guildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}`
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// Obter status do bot
app.get('/api/dashboard/bot-status', async (req, res) => {
    try {
        const response = await fetch(`${process.env.API_URL}/api/bots`, {
            headers: { 'Authorization': `Bearer ${process.env.API_SECRET || 'internal_secret'}` }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar status' });
    }
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║         🎛️  INSIGHTBOT DASHBOARD INICIADA  🎛️           ║
╠══════════════════════════════════════════════════════════╣
║  📡 Dashboard: http://localhost:${PORT}
║  🔐 OAuth2 configurado
║  🤖 Integrado com InsightBot
╚══════════════════════════════════════════════════════════╝
    `);
});
