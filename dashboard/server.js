require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
// ⭐ CORRIGIDO: Usar a porta do Railway (8080) ou 4000 para desenvolvimento local
const DASHBOARD_PORT = process.env.PORT || 4000;

// ===== CONFIGURAÇÃO DA SESSÃO =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'dashboard_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
        secure: process.env.NODE_ENV === 'production' // Secure em produção
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
    // Salvar a URL original para redirecionar depois do login
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

// Página inicial
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Login
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('login', { 
        user: req.user,
        error: null 
    });
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
        if (err) console.error('Erro ao fazer logout:', err);
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
        let botStatus = { 
            botsOnline: 1, 
            totalServidores: 0, 
            totalUsuarios: 0, 
            ping: 0 
        };
        
        try {
            // Tentar buscar da API local do bot
            const botPort = process.env.PORT || 3000;
            const statusRes = await fetch(`http://localhost:${botPort}/api/bots`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (statusRes.ok) {
                botStatus = await statusRes.json();
            }
        } catch (e) {
            console.log('Bot API não disponível, usando dados padrão');
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
            return res.render('error', { 
                user: req.user, 
                error: 'Você não tem permissão para gerenciar este servidor.' 
            });
        }
        
        // Buscar informações do servidor
        let guildInfo = null;
        try {
            const guildRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
                headers: { Authorization: `Bot ${process.env.TOKEN}` }
            });
            if (guildRes.ok) {
                guildInfo = await guildRes.json();
            }
        } catch (e) {}
        
        // Buscar canais do servidor
        let channels = [];
        try {
            const botPort = process.env.PORT || 3000;
            const chRes = await fetch(`http://localhost:${botPort}/api/guild/${guildId}/channels`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (chRes.ok) {
                channels = await chRes.json();
            }
        } catch (e) {
            console.log('Não foi possível buscar canais:', e.message);
        }
        
        // Buscar configurações do bot
        let botConfig = { suggestionsChannel: null, receiveChannel: null };
        try {
            const botPort = process.env.PORT || 3000;
            const configRes = await fetch(`http://localhost:${botPort}/api/guild/${guildId}/config`, {
                headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
            });
            if (configRes.ok) {
                botConfig = await configRes.json();
            }
        } catch (e) {
            console.log('Não foi possível buscar configurações:', e.message);
        }
        
        res.render('guild-dashboard', {
            user: req.user,
            guilds: adminGuilds,
            selectedGuild: guildId,
            guildInfo: guildInfo,
            channels: channels,
            botConfig: botConfig,
            currentPage: 'guild',
            error: null
        });
    } catch (error) {
        console.error('Erro ao carregar servidor:', error);
        res.render('error', { 
            user: req.user, 
            error: 'Erro ao carregar configurações do servidor.' 
        });
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
        const botPort = process.env.PORT || 3000;
        const response = await fetch(`http://localhost:${botPort}/api/guild/${guildId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_SECRET}`
            },
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
});

// API: Buscar estatísticas do servidor
app.get('/api/dashboard/:guildId/stats', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    
    try {
        const botPort = process.env.PORT || 3000;
        const response = await fetch(`http://localhost:${botPort}/api/guild/${guildId}/stats`, {
            headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            res.json(data);
        } else {
            res.json({
                today: 0,
                total: 0,
                upvotes: 0,
                downvotes: 0,
                participants: 0
            });
        }
    } catch (error) {
        res.json({
            today: 0,
            total: 0,
            upvotes: 0,
            downvotes: 0,
            participants: 0
        });
    }
});

// API: Status do Bot
app.get('/api/bot/status', async (req, res) => {
    try {
        const botPort = process.env.PORT || 3000;
        const response = await fetch(`http://localhost:${botPort}/api/bots`, {
            headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            res.json({
                servers: data.totalServidores || 0,
                users: data.totalUsuarios || 0,
                ping: data.ping || 0,
                online: true
            });
        } else {
            res.json({
                servers: 0,
                users: 0,
                ping: 0,
                online: false
            });
        }
    } catch (error) {
        res.json({
            servers: 0,
            users: 0,
            ping: 0,
            online: false
        });
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
║  🤖 Integrado com InsightBot
║  ❤️  Health Check: http://localhost:${DASHBOARD_PORT}/health
╚══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;