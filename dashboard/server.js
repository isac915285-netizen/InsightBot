require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

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

// ===== ROTAS =====

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ⭐ ROTA PRINCIPAL ⭐
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>InsightBot Dashboard</title>
            <style>
                body { font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { text-align: center; padding: 40px; background: #141518; border-radius: 16px; border: 1px solid #5865F2; }
                h1 { color: #5865F2; }
                .btn { background: #5865F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin-top: 20px; }
                .status { color: #23a55a; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 InsightBot Dashboard</h1>
                <p class="status">✅ Servidor Online</p>
                <p>Painel de controle para gerenciar seu bot</p>
                <a href="/login" class="btn">Entrar com Discord</a>
                <br><br>
                <a href="/health" style="color: #6b6b6b;">Health Check</a>
            </div>
        </body>
        </html>
    `);
});

// ⭐ ROTA DE LOGIN ⭐
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    // Verificar se o arquivo de view existe
    try {
        res.render('login', { user: req.user, error: null });
    } catch (e) {
        // Se não encontrar a view, mostrar HTML direto
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login | InsightBot</title>
                <style>
                    body { font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .container { text-align: center; padding: 40px; background: #141518; border-radius: 16px; }
                    .btn { background: #5865F2; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 1.1rem; display: inline-block; }
                    .btn i { margin-right: 10px; }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            </head>
            <body>
                <div class="container">
                    <h1 style="color: #5865F2;">🔐 Login</h1>
                    <p style="margin-bottom: 30px; color: #b5b5b5;">Entre com sua conta Discord</p>
                    <a href="/auth/discord" class="btn">
                        <i class="fab fa-discord"></i> Entrar com Discord
                    </a>
                </div>
            </body>
            </html>
        `);
    }
});

// ⭐ ROTA DE AUTENTICAÇÃO DISCORD ⭐
app.get('/auth/discord', passport.authenticate('discord'));

// ⭐ ROTA DE CALLBACK ⭐
app.get('/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login',
        successRedirect: '/dashboard'
    })
);

// ⭐ ROTA DE LOGOUT ⭐
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// ⭐ DASHBOARD ⭐
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard | InsightBot</title>
            <style>
                body { font-family: Arial; background: #0a0a0c; color: white; padding: 40px; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                .user { display: flex; align-items: center; gap: 15px; }
                .user img { width: 40px; height: 40px; border-radius: 50%; }
                .logout { color: #f23f43; text-decoration: none; }
                h1 { color: #5865F2; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 Dashboard</h1>
                <div class="user">
                    <img src="https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png" alt="Avatar">
                    <span>${req.user.username}</span>
                    <a href="/logout" class="logout">Sair</a>
                </div>
            </div>
            <p>Bem-vindo, ${req.user.username}!</p>
            <p>Dashboard em construção...</p>
        </body>
        </html>
    `);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});