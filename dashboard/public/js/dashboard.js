// Dashboard JavaScript
console.log('✅ InsightBot Dashboard carregada');

// Função para fazer requisições autenticadas
async function apiCall(endpoint, options = {}) {
    try {
        const res = await fetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        return await res.json();
    } catch (error) {
        console.error('Erro na API:', error);
        return { error: 'Erro de conexão' };
    }
}

// Atualizar status do bot periodicamente
async function updateBotStatus() {
    try {
        const res = await fetch('/api/bot/status');
        const data = await res.json();
        
        const serverEl = document.getElementById('serverCount');
        const userEl = document.getElementById('userCount');
        const pingEl = document.getElementById('pingValue');
        
        if (serverEl) serverEl.textContent = data.servers || 0;
        if (userEl) userEl.textContent = (data.users || 0).toLocaleString();
        if (pingEl) pingEl.textContent = (data.ping || 0) + 'ms';
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

// Atualizar a cada 30 segundos
setInterval(updateBotStatus, 30000);
if (document.getElementById('serverCount')) updateBotStatus();

// Função para mostrar toast de notificação
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Função para alternar tabs
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabContent = document.getElementById(tabName + '-tab');
    if (tabContent) tabContent.classList.add('active');
    
    // Encontrar o botão clicado
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName) || 
            (tabName === 'overview' && btn.textContent.includes('Visão Geral')) ||
            (tabName === 'commands' && btn.textContent.includes('Comandos')) ||
            (tabName === 'suggestions' && btn.textContent.includes('Sugestões')) ||
            (tabName === 'stats' && btn.textContent.includes('Estatísticas'))) {
            btn.classList.add('active');
        }
    });
}

// Função para salvar configurações
async function saveConfig() {
    const guildId = window.guildId;
    if (!guildId) {
        showToast('ID do servidor não encontrado', 'error');
        return;
    }
    
    const config = {
        suggestionsChannel: document.getElementById('suggestions-channel')?.value || null,
        receiveChannel: document.getElementById('receive-channel')?.value || null,
        commands: {
            suggest: document.getElementById('cmd-suggest')?.checked ?? true,
            stats: document.getElementById('cmd-stats')?.checked ?? true,
            topsuggestions: document.getElementById('cmd-topsuggestions')?.checked ?? true,
            help: document.getElementById('cmd-help')?.checked ?? true
        }
    };
    
    try {
        const res = await fetch(`/api/dashboard/${guildId}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('✅ Configurações salvas com sucesso!', 'success');
        } else {
            showToast('❌ ' + (data.error || 'Erro ao salvar configurações'), 'error');
        }
    } catch (error) {
        showToast('❌ Erro de conexão com o servidor', 'error');
    }
}

// Função para carregar estatísticas
async function loadStats() {
    const guildId = window.guildId;
    if (!guildId) return;
    
    try {
        const res = await fetch(`/api/dashboard/${guildId}/stats`);
        const data = await res.json();
        
        // Atualizar elementos de estatísticas se existirem
        const todayEl = document.getElementById('todaySuggestions');
        const totalEl = document.getElementById('totalSuggestions');
        const votesEl = document.getElementById('totalVotes');
        const detailTotalEl = document.getElementById('detail-total-suggestions');
        const upvotesEl = document.getElementById('detail-upvotes');
        const downvotesEl = document.getElementById('detail-downvotes');
        const participantsEl = document.getElementById('detail-participants');
        
        if (todayEl) todayEl.textContent = data.today || 0;
        if (totalEl) totalEl.textContent = data.total || 0;
        if (votesEl) votesEl.textContent = (data.upvotes || 0) + (data.downvotes || 0);
        if (detailTotalEl) detailTotalEl.textContent = data.total || 0;
        if (upvotesEl) upvotesEl.textContent = data.upvotes || 0;
        if (downvotesEl) downvotesEl.textContent = data.downvotes || 0;
        if (participantsEl) participantsEl.textContent = data.participants || 0;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

// Carregar estatísticas se estiver na página de servidor
if (window.guildId) {
    loadStats();
}

// Alternar todos os switches de uma vez (para o admin)
function toggleAllCommands(enable) {
    const switches = ['cmd-suggest', 'cmd-stats', 'cmd-topsuggestions', 'cmd-help'];
    switches.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = enable;
    });
}

// Confirmar antes de sair se houver alterações não salvas
let hasUnsavedChanges = false;

function markAsChanged() {
    hasUnsavedChanges = true;
}

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Você tem alterações não salvas. Deseja realmente sair?';
    }
});

// Adicionar listeners para detectar mudanças
document.addEventListener('DOMContentLoaded', () => {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('change', markAsChanged);
        input.addEventListener('keyup', markAsChanged);
    });
    
    // Resetar flag após salvar
    const saveBtn = document.querySelector('.btn-save');
    if (saveBtn) {
        const originalSave = saveBtn.onclick;
        saveBtn.onclick = async function(e) {
            await saveConfig();
            hasUnsavedChanges = false;
        };
    }
});

// Mobile menu toggle (se necessário)
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}
