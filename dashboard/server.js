require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ⭐ HEALTH CHECK - PRIMEIRA ROTA ⭐
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ⭐ ROTA RAIZ ⭐
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>InsightBot Dashboard</title>
            <style>
                body { font-family: Arial; background: #0a0a0c; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .container { text-align: center; }
                .btn { background: #5865F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 InsightBot Dashboard</h1>
                <p>Servidor online!</p>
                <a href="/login" class="btn">Fazer Login</a>
                <br><br>
                <a href="/health">Health Check</a>
            </div>
        </body>
        </html>
    `);
});

// Iniciar servidor - OUVINDO EM 0.0.0.0 (OBRIGATÓRIO PARA RAILWAY)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT} (0.0.0.0)`);
});