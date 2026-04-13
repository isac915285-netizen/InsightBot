require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ⭐ CONFIAR NO PROXY DO RAILWAY ⭐
app.set('trust proxy', 1);

// ===== CONFIGURAÇÃO DA SESSÃO (CORRIGIDA) =====
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

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

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
    res.redirect('/login');
}

// ===== ROTAS =====

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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
                    margin: 0;
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
                .logo {
                    margin-bottom: 20px;
                }
                .logo i {
                    font-size: 4rem;
                    color: #5865F2;
                    filter: drop-shadow(0 0 20px rgba(88, 101, 242, 0.4));
                }
                h1 { 
                    color: white; 
                    font-size: 2rem;
                    margin-bottom: 10px;
                }
                h1 span { color: #5865F2; }
                .subtitle {
                    color: #b5b5b5;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    font-size: 0.8rem;
                    margin-bottom: 30px;
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
                .btn { 
                    background: #5865F2; 
                    color: white; 
                    padding: 16px 32px; 
                    border-radius: 12px; 
                    text-decoration: none; 
                    font-size: 1.1rem; 
                    display: inline-block;
                    font-weight: 600;
                    transition: all 0.2s;
                    border: none;
                    cursor: pointer;
                }
                .btn i { margin-right: 10px; }
                .btn:hover {
                    background: #4752C4;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(88, 101, 242, 0.3);
                }
                .footer {
                    margin-top: 30px;
                    color: #4a4a4a;
                    font-size: 0.8rem;
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
                
                <p style="margin-bottom: 25px; color: #b5b5b5;">Faça login com Discord para continuar</p>
                
                <a href="/auth/discord" class="btn">
                    <i class="fab fa-discord"></i> Entrar com Discord
                </a>
                
                <div class="footer">
                    <p>InsightBot v2.1.0</p>
                    <p style="margin-top: 5px;">© 2026 - Todos os direitos reservados</p>
                </div>
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

// Dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard | InsightBot</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Inter', Arial, sans-serif; 
                    background: #0a0a0c; 
                    color: white; 
                    min-height: 100vh;
                }
                .header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 20px 40px;
                    background: #141518;
                    border-bottom: 1px solid rgba(88, 101, 242, 0.2);
                }
                .logo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 1.3rem;
                    font-weight: 700;
                }
                .logo i { color: #5865F2; font-size: 1.8rem; }
                .logo span { color: #5865F2; }
                .user { 
                    display: flex; 
                    align-items: center; 
                    gap: 15px; 
                }
                .user img { 
                    width: 40px; 
                    height: 40px; 
                    border-radius: 50%; 
                    border: 2px solid #5865F2;
                }
                .logout { 
                    color: #f23f43; 
                    text-decoration: none; 
                    padding: 8px 16px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .logout:hover {
                    background: rgba(242, 63, 67, 0.1);
                }
                .content {
                    padding: 40px;
                }
                .welcome {
                    font-size: 1.5rem;
                    margin-bottom: 30px;
                }
                .welcome span {
                    color: #5865F2;
                    font-weight: 700;
                }
                .card {
                    background: #141518;
                    border: 1px solid rgba(88, 101, 242, 0.2);
                    border-radius: 16px;
                    padding: 30px;
                    max-width: 600px;
                }
                .card h3 {
                    margin-bottom: 15px;
                    color: #5865F2;
                }
                .card p {
                    color: #b5b5b5;
                    line-height: 1.6;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">
                    <i class="fas fa-robot"></i>
                    <span>Insight</span>Bot
                </div>
                <div class="user">
                    <img src="https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png" alt="Avatar">
                    <span>${req.user.username}</span>
                    <a href="/logout" class="logout"><i class="fas fa-sign-out-alt"></i> Sair</a>
                </div>
            </div>
            <div class="content">
                <div class="welcome">
                    Bem-vindo, <span>${req.user.username}</span>!
                </div>
                <div class="card">
                    <h3><i class="fas fa-check-circle" style="color: #23a55a;"></i> Dashboard em construção</h3>
                    <p>Em breve você poderá gerenciar todas as configurações do seu bot aqui.</p>
                    <p style="margin-top: 15px;">Enquanto isso, use os comandos no Discord:</p>
                    <p style="margin-top: 10px; font-family: monospace;">!help &nbsp;&nbsp;|&nbsp;&nbsp; !setup &nbsp;&nbsp;|&nbsp;&nbsp; /suggestions</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
});