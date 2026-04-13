// InsightBot - Bot de Sugestões para Discord
// Desenvolvido com discord.js v14

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fetch = require('node-fetch');
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ChannelType,
    PermissionsBitField,
    Events,
    ActivityType,
    PresenceUpdateStatus
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURAÇÃO DO HEARTBEAT (COMPLETO)
// ============================================
const BOT_CONFIG = {
    botId: 'insight',
    token: process.env.INSIGHT_TOKEN || 'INSIGHT_TOKEN_123',
    apiUrl: 'https://y2k-nat.up.railway.app/api/bot/heartbeat'
};

let totalComandosExecutados = 0;

async function sendHeartbeat(client) {
    try {
        const uniqueUsers = new Set();
        const guildIds = [];
        
        client.guilds.cache.forEach(guild => {
            guildIds.push(guild.id);
            guild.members.cache.forEach(member => {
                uniqueUsers.add(member.id);
            });
        });
        
        const data = {
            botId: BOT_CONFIG.botId,
            token: BOT_CONFIG.token,
            status: client.isReady() ? 'online' : 'offline',
            servidores: client.guilds.cache.size,
            guildIds: guildIds,
            usuarios: uniqueUsers.size,
            userIds: Array.from(uniqueUsers),
            comandos: totalComandosExecutados,
            ping: client.ws.ping,
            uptime: formatUptime(client.uptime),
            versao: '2.1.0'
        };
        
        const res = await fetch(BOT_CONFIG.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            console.log(`✅ Heartbeat enviado! Servidores: ${guildIds.length}, Usuários: ${uniqueUsers.size}, Comandos: ${totalComandosExecutados}`);
        } else {
            console.error('❌ Erro ao enviar heartbeat:', res.status);
        }
    } catch (error) {
        console.error('❌ Erro ao enviar heartbeat:', error.message);
    }
}

function formatUptime(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d}d ${h}h ${m}m`;
}
// ===== FIM DA CONFIGURAÇÃO DO HEARTBEAT =====

// ============================================
// CONFIGURAÇÕES INICIAIS
// ============================================

// Carregar variáveis de ambiente
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

// Verificar se as variáveis essenciais estão definidas
if (!TOKEN) {
    console.error('❌ ERRO: TOKEN não definido no arquivo .env');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('❌ ERRO: OWNER_ID não definido no arquivo .env');
    process.exit(1);
}

// Inicializar cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember,
        Partials.ThreadMember,
        Partials.GuildScheduledEvent
    ]
});

// ============================================
// COLLECTIONS PARA ARMAZENAMENTO
// ============================================

client.commands = new Collection();
client.slashCommands = new Collection();
client.prefixCommands = new Collection();
client.suggestionsConfig = new Collection();
client.cooldowns = new Collection();
client.suggestionCount = new Collection();
client.userSuggestions = new Collection();
client.suggestionVotes = new Collection();

// ============================================
// DADOS DE CONFIGURAÇÃO PERSISTENTES
// ============================================

const CONFIG_FILE = path.join(__dirname, 'suggestions_config.json');
let suggestionsConfig = {};

// Carregar configurações salvas
try {
    if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        suggestionsConfig = JSON.parse(data);
        console.log('📁 Configurações de sugestões carregadas do arquivo');
    } else {
        console.log('📁 Nenhum arquivo de configuração encontrado, criando novo');
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 4));
    }
} catch (error) {
    console.error('❌ Erro ao carregar configurações:', error);
    suggestionsConfig = {};
}

// Função para salvar configurações
function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(suggestionsConfig, null, 4));
        console.log('💾 Configurações de sugestões salvas');
    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error);
    }
}

// ============================================
// UTILITÁRIOS
// ============================================

// Função para verificar permissões do owner
function isOwner(userId) {
    return userId === OWNER_ID;
}

// Função para criar embed padrão
function createEmbed(title, description, color = '#5865F2', fields = []) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp()
        .setFooter({ 
            text: 'InsightBot - Sistema de Sugestões', 
            iconURL: 'https://cdn.discordapp.com/emojis/1107484326957170758.webp' 
        });
    
    if (fields.length > 0) {
        embed.addFields(fields);
    }
    
    return embed;
}

// Função para criar embed de erro
function createErrorEmbed(description) {
    return createEmbed('❌ Erro', description, '#FF0000');
}

// Função para criar embed de sucesso
function createSuccessEmbed(description) {
    return createEmbed('✅ Sucesso', description, '#00FF00');
}

// Função para formatar data
function formatDate(date) {
    return new Date(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Função para enviar mensagem de inicialização
async function sendStartupMessage() {
    try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const guilds = client.guilds.cache;
        
        for (const [guildId, guild] of guilds) {
            try {
                let channel = guild.channels.cache.find(
                    ch => ch.name.toLowerCase() === 'geral' && 
                    ch.type === ChannelType.GuildText
                );
                
                if (!channel) {
                    channel = guild.channels.cache.find(
                        ch => ch.name.toLowerCase() === 'loginfo' && 
                        ch.type === ChannelType.GuildText
                    );
                }
                
                if (channel) {
                    const messages = [
                        `🌟 **InsightBot está online!** Use \`!help\` para ver todos os comandos disponíveis.`,
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                        `🤖 **Bot Iniciado com Sucesso** 🤖`,
                        `✨ **InsightBot** acaba de ser ativado e está pronto para gerenciar sugestões!`,
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                        `📢 **Sistema Online:**`,
                        `✅ Comandos Slash disponíveis (apenas configuração)`,
                        `✅ Sistema de Prefixo (!) ativo`,
                        `✅ Gerenciador de Sugestões pronto`,
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                        `🎯 **InsightBot - Transformando ideias em realidade!** 🚀`,
                        `\`\`\`css\n[InsightBot] :: Sistema iniciado com sucesso\n[Status] :: Online e operacional\n[Versão] :: 1.0.0\n\`\`\``,
                        `╔══════════════════════════════════════════════╗`,
                        `║           🌟 INSIGHTBOT ONLINE 🌟            ║`,
                        `╚══════════════════════════════════════════════╝`,
                        `**🎉 Bem-vindo ao InsightBot!**\n*Seu assistente de sugestões inteligentes está ativo.*`,
                        `> 📌 **Dica:** Use \`!help\` para ver todos os comandos disponíveis`,
                        `> 💡 **Dica:** Use \`!setup\` para ver como configurar o sistema`,
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                        `🟢 **Status:** Operacional | 🕐 **Horário:** ${new Date().toLocaleTimeString('pt-BR')}`
                    ];
                    
                    for (const msg of messages) {
                        await channel.send(msg);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    console.log(`✅ Mensagem de inicialização enviada em "${channel.name}" no servidor ${guild.name}`);
                }
            } catch (error) {
                console.error(`❌ Erro ao enviar mensagem no servidor ${guild.name}:`, error);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao enviar mensagens de inicialização:', error);
    }
}

// ============================================
// SISTEMA DE SUGESTÕES
// ============================================

class SuggestionManager {
    constructor() {
        this.suggestions = new Map();
        this.votes = new Map();
        this.userSuggestions = new Map();
    }
    
    addSuggestion(guildId, userId, content) {
        if (!this.userSuggestions.has(guildId)) {
            this.userSuggestions.set(guildId, new Map());
        }
        
        const guildSuggestions = this.userSuggestions.get(guildId);
        if (!guildSuggestions.has(userId)) {
            guildSuggestions.set(userId, []);
        }
        
        const userSugs = guildSuggestions.get(userId);
        const suggestionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
        const suggestion = {
            id: suggestionId,
            userId: userId,
            content: content,
            timestamp: Date.now(),
            votes: { up: 0, down: 0 },
            voters: new Set()
        };
        
        userSugs.push(suggestion);
        
        if (!this.suggestions.has(guildId)) {
            this.suggestions.set(guildId, new Map());
        }
        this.suggestions.get(guildId).set(suggestionId, suggestion);
        
        return suggestion;
    }
    
    getSuggestion(guildId, suggestionId) {
        return this.suggestions.get(guildId)?.get(suggestionId);
    }
    
    addVote(guildId, suggestionId, userId, voteType) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return false;
        
        if (suggestion.voters.has(userId)) {
            return false;
        }
        
        if (voteType === 'up') {
            suggestion.votes.up++;
        } else {
            suggestion.votes.down++;
        }
        
        suggestion.voters.add(userId);
        return true;
    }
    
    getUserSuggestions(guildId, userId) {
        return this.userSuggestions.get(guildId)?.get(userId) || [];
    }
}

const suggestionManager = new SuggestionManager();

// ============================================
// COMANDOS COM PREFIXO (!)
// ============================================

const prefixCooldowns = new Collection();
const PREFIX = '!';
const COOLDOWN_TIME = 3000;

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    // ===== INCREMENTAR CONTADOR =====
    totalComandosExecutados++;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    if (prefixCooldowns.has(message.author.id)) {
        const cooldownExpiration = prefixCooldowns.get(message.author.id);
        if (Date.now() < cooldownExpiration) {
            const timeLeft = (cooldownExpiration - Date.now()) / 1000;
            return message.reply({
                embeds: [createErrorEmbed(`Aguarde ${timeLeft.toFixed(1)} segundos antes de usar outro comando.`)]
            });
        }
    }
    
    prefixCooldowns.set(message.author.id, Date.now() + COOLDOWN_TIME);
    setTimeout(() => prefixCooldowns.delete(message.author.id), COOLDOWN_TIME);
    
    // ============================================
    // COMANDO: !help / !ajuda / !comandos
    // ============================================
    if (commandName === 'help' || commandName === 'ajuda' || commandName === 'comandos') {
        const helpEmbed = createEmbed(
            '📚 Comandos do InsightBot',
            'Aqui estão todos os comandos disponíveis com o prefixo `!`',
            '#5865F2',
            [
                {
                    name: '📌 Comandos Gerais',
                    value: '`!help` - Mostra esta mensagem\n`!ping` - Verifica a latência\n`!info` - Informações do bot\n`!invite` - Link para convidar\n`!support` - Informações de suporte',
                    inline: false
                },
                {
                    name: '💡 Comandos de Sugestão',
                    value: '`!suggest [texto]` - Envia uma sugestão\n`!mysuggestions` - Ver suas sugestões\n`!topsuggestions` - Sugestões mais votadas\n`!suggestioninfo [id]` - Info de uma sugestão',
                    inline: false
                },
                {
                    name: '📊 Comandos de Estatísticas',
                    value: '`!stats` - Estatísticas gerais\n`!serverstats` - Estatísticas do servidor\n`!userstats [@user]` - Estatísticas de um usuário',
                    inline: false
                },
                {
                    name: '⚙️ Comandos de Configuração (Apenas Owner)',
                    value: '`!setup` - Guia de configuração\n`!config` - Ver configurações atuais\n`!resetconfig` - Resetar configurações',
                    inline: false
                },
                {
                    name: '🎮 Comandos Diversos',
                    value: '`!avatar [@user]` - Mostra avatar\n`!userinfo [@user]` - Info do usuário\n`!serverinfo` - Info do servidor\n`!botinfo` - Info do bot',
                    inline: false
                },
                {
                    name: '🔧 Comandos Slash',
                    value: '`/suggestions` - Configurar canal de sugestões\n`/suggestionschannel` - Configurar canal de recebimento',
                    inline: false
                }
            ]
        );
        
        return message.reply({ embeds: [helpEmbed] });
    }
    
    // ============================================
    // COMANDO: !ping
    // ============================================
    if (commandName === 'ping') {
        const sent = await message.reply({ content: '🏓 Pong! Calculando...' });
        
        const pingEmbed = createEmbed(
            '🏓 Pong!',
            `**Latência da API:** ${client.ws.ping}ms\n**Latência da Mensagem:** ${sent.createdTimestamp - message.createdTimestamp}ms`,
            '#00FF00'
        );
        
        return sent.edit({ content: null, embeds: [pingEmbed] });
    }
    
    // ============================================
    // COMANDO: !info / !botinfo
    // ============================================
    if (commandName === 'info' || commandName === 'botinfo') {
        const infoEmbed = createEmbed(
            '🤖 InsightBot - Informações',
            'Bot de sugestões inteligente para Discord',
            '#5865F2',
            [
                {
                    name: '📊 Estatísticas',
                    value: `**Servidores:** ${client.guilds.cache.size}\n**Usuários:** ${client.users.cache.size}\n**Canais:** ${client.channels.cache.size}`,
                    inline: true
                },
                {
                    name: '⚙️ Versão',
                    value: `**Bot:** 1.0.0\n**Discord.js:** v14\n**Node.js:** ${process.version}`,
                    inline: true
                },
                {
                    name: '🕐 Uptime',
                    value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`,
                    inline: true
                },
                {
                    name: '👑 Desenvolvedor',
                    value: `<@${OWNER_ID}>`,
                    inline: true
                },
                {
                    name: '📋 Comandos',
                    value: 'Use `!help` para ver todos os comandos disponíveis',
                    inline: false
                }
            ]
        );
        
        return message.reply({ embeds: [infoEmbed] });
    }
    
    // ============================================
    // COMANDO: !invite / !convite
    // ============================================
    if (commandName === 'invite' || commandName === 'convite') {
        const inviteEmbed = createEmbed(
            '🔗 Convite do Bot',
            'Convide o InsightBot para seu servidor!',
            '#5865F2',
            [
                {
                    name: '🤖 Link de Convite',
                    value: '[Clique aqui para convidar](https://discord.com/oauth2/authorize?client_id=1491182523177242754&scope=bot&permissions=8)',
                    inline: false
                },
                {
                    name: '⚠️ Permissões Necessárias',
                    value: 'Administrador (recomendado para funcionamento completo)',
                    inline: false
                },
                {
                    name: '📋 Permissões Mínimas',
                    value: 'Gerenciar Mensagens, Enviar Mensagens, Adicionar Reações, Ler Histórico',
                    inline: false
                }
            ]
        );
        
        return message.reply({ embeds: [inviteEmbed] });
    }
    
    // ============================================
    // COMANDO: !support / !suporte
    // ============================================
    if (commandName === 'support' || commandName === 'suporte') {
        const supportEmbed = createEmbed(
            '🆘 Suporte InsightBot',
            'Precisa de ajuda? Entre em contato!',
            '#5865F2',
            [
                {
                    name: '👑 Desenvolvedor',
                    value: `<@${OWNER_ID}>`,
                    inline: true
                },
                {
                    name: '📧 Contato',
                    value: 'Envie uma DM para suporte',
                    inline: true
                },
                {
                    name: '💡 Sugestões',
                    value: 'Use `!suggest` para enviar sugestões',
                    inline: true
                },
                {
                    name: '📚 Documentação',
                    value: 'Use `!help` para ver todos os comandos',
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [supportEmbed] });
    }
    
    // ============================================
    // COMANDO: !avatar
    // ============================================
    if (commandName === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        
        const avatarEmbed = createEmbed(
            `🖼️ Avatar de ${user.username}`,
            `Clique [aqui](${user.displayAvatarURL({ dynamic: true, size: 4096 })}) para baixar`,
            '#5865F2'
        ).setImage(user.displayAvatarURL({ dynamic: true, size: 4096 }));
        
        return message.reply({ embeds: [avatarEmbed] });
    }
    
    // ============================================
    // COMANDO: !userinfo
    // ============================================
    if (commandName === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        
        const userInfoEmbed = createEmbed(
            `👤 Informações de ${user.username}`,
            `Aqui estão as informações do usuário:`,
            '#5865F2',
            [
                {
                    name: '📝 Nome',
                    value: `${user.tag}`,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: user.id,
                    inline: true
                },
                {
                    name: '📅 Conta criada em',
                    value: formatDate(user.createdAt),
                    inline: true
                },
                {
                    name: '📥 Entrou no servidor em',
                    value: member ? formatDate(member.joinedAt) : 'Não disponível',
                    inline: true
                },
                {
                    name: '🎨 Cargos',
                    value: member ? `${member.roles.cache.size - 1} cargos` : 'Não disponível',
                    inline: true
                },
                {
                    name: '👑 Dono do Servidor',
                    value: member && member.id === message.guild.ownerId ? 'Sim' : 'Não',
                    inline: true
                }
            ]
        ).setThumbnail(user.displayAvatarURL({ dynamic: true }));
        
        return message.reply({ embeds: [userInfoEmbed] });
    }
    
    // ============================================
    // COMANDO: !serverinfo
    // ============================================
    if (commandName === 'serverinfo') {
        const guild = message.guild;
        
        const serverInfoEmbed = createEmbed(
            `📊 Informações de ${guild.name}`,
            'Informações detalhadas do servidor',
            '#5865F2',
            [
                {
                    name: '👑 Dono',
                    value: `<@${guild.ownerId}>`,
                    inline: true
                },
                {
                    name: '🆔 ID',
                    value: guild.id,
                    inline: true
                },
                {
                    name: '📅 Criado em',
                    value: formatDate(guild.createdAt),
                    inline: true
                },
                {
                    name: '👥 Membros',
                    value: `${guild.memberCount}`,
                    inline: true
                },
                {
                    name: '💬 Canais',
                    value: `${guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: '🎨 Cargos',
                    value: `${guild.roles.cache.size}`,
                    inline: true
                },
                {
                    name: '😊 Emojis',
                    value: `${guild.emojis.cache.size}`,
                    inline: true
                },
                {
                    name: '🔰 Nível de Boost',
                    value: `Nível ${guild.premiumTier}`,
                    inline: true
                },
                {
                    name: '🚀 Boosts',
                    value: `${guild.premiumSubscriptionCount || 0}`,
                    inline: true
                }
            ]
        );
        
        if (guild.iconURL()) {
            serverInfoEmbed.setThumbnail(guild.iconURL({ dynamic: true }));
        }
        
        if (guild.bannerURL()) {
            serverInfoEmbed.setImage(guild.bannerURL({ dynamic: true }));
        }
        
        return message.reply({ embeds: [serverInfoEmbed] });
    }
    
    // ============================================
    // COMANDO: !suggest / !sugestao / !sugerir
    // ============================================
    if (commandName === 'suggest' || commandName === 'sugestao' || commandName === 'sugerir') {
        const guildId = message.guild.id;
        const config = suggestionsConfig[guildId];
        
        if (!config || !config.suggestionsChannel) {
            return message.reply({
                embeds: [createErrorEmbed('O sistema de sugestões não está configurado neste servidor.')]
            });
        }
        
        const content = args.join(' ');
        if (!content) {
            return message.reply({
                embeds: [createErrorEmbed('Por favor, escreva sua sugestão.\nExemplo: `!suggest Adicionar canal de música`')]
            });
        }
        
        if (content.length < 10) {
            return message.reply({
                embeds: [createErrorEmbed('Sua sugestão deve ter pelo menos 10 caracteres.')]
            });
        }
        
        if (content.length > 1000) {
            return message.reply({
                embeds: [createErrorEmbed('Sua sugestão não pode ter mais de 1000 caracteres.')]
            });
        }
        
        const suggestion = suggestionManager.addSuggestion(guildId, message.author.id, content);
        
        const receiveChannel = message.guild.channels.cache.get(config.receiveChannel);
        if (receiveChannel) {
            const suggestionEmbed = createEmbed(
                '💡 Nova Sugestão',
                content,
                '#5865F2',
                [
                    {
                        name: '👤 Autor',
                        value: `${message.author.tag}`,
                        inline: true
                    }
                ]
            );
            
            const sentMessage = await receiveChannel.send({ embeds: [suggestionEmbed] });
            await sentMessage.react('👍');
            await sentMessage.react('👎');
        }
        
        const confirmEmbed = createSuccessEmbed(
            `Sua sugestão foi enviada com sucesso!\n\n**ID:** ${suggestion.id}\n**Sugestão:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
        );
        
        return message.reply({ embeds: [confirmEmbed] });
    }
    
    // ============================================
    // COMANDO: !mysuggestions / !minhas
    // ============================================
    if (commandName === 'mysuggestions' || commandName === 'minhas') {
        const guildId = message.guild.id;
        const userSuggestions = suggestionManager.getUserSuggestions(guildId, message.author.id);
        
        if (!userSuggestions || userSuggestions.length === 0) {
            return message.reply({
                embeds: [createEmbed(
                    '📝 Suas Sugestões',
                    'Você ainda não enviou nenhuma sugestão.',
                    '#5865F2'
                )]
            });
        }
        
        const suggestionsList = userSuggestions
            .slice(-10)
            .reverse()
            .map((sug, index) => {
                return `**${index + 1}.** ${sug.content.substring(0, 50)}${sug.content.length > 50 ? '...' : ''}\n` +
                       `📊 Votos: 👍 ${sug.votes.up} | 👎 ${sug.votes.down}\n` +
                       `📅 ${formatDate(sug.timestamp)}\n` +
                       `🆔 ID: ${sug.id}`;
            })
            .join('\n\n');
        
        const embed = createEmbed(
            '📝 Suas Sugestões',
            `Aqui estão suas últimas ${Math.min(userSuggestions.length, 10)} sugestões:`,
            '#5865F2',
            [
                {
                    name: '💡 Sugestões Enviadas',
                    value: suggestionsList || 'Nenhuma sugestão encontrada',
                    inline: false
                },
                {
                    name: '📊 Total',
                    value: `${userSuggestions.length} sugestões enviadas`,
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !stats / !estatisticas
    // ============================================
    if (commandName === 'stats' || commandName === 'estatisticas') {
        const guildId = message.guild.id;
        const config = suggestionsConfig[guildId];
        
        if (!config || !config.suggestionsChannel || !config.receiveChannel) {
            return message.reply({
                embeds: [createErrorEmbed('O sistema de sugestões não está configurado neste servidor.')]
            });
        }
        
        let totalSuggestions = 0;
        let totalVotes = { up: 0, down: 0 };
        const userSuggestions = suggestionManager.userSuggestions.get(guildId);
        
        if (userSuggestions) {
            for (const suggestions of userSuggestions.values()) {
                totalSuggestions += suggestions.length;
                for (const sug of suggestions) {
                    totalVotes.up += sug.votes.up;
                    totalVotes.down += sug.votes.down;
                }
            }
        }
        
        const statsEmbed = createEmbed(
            '📊 Estatísticas de Sugestões',
            `Estatísticas do sistema de sugestões em **${message.guild.name}**`,
            '#5865F2',
            [
                {
                    name: '💡 Total de Sugestões',
                    value: `${totalSuggestions}`,
                    inline: true
                },
                {
                    name: '👥 Usuários Participantes',
                    value: `${userSuggestions?.size || 0}`,
                    inline: true
                },
                {
                    name: '👍 Total de Votos Positivos',
                    value: `${totalVotes.up}`,
                    inline: true
                },
                {
                    name: '👎 Total de Votos Negativos',
                    value: `${totalVotes.down}`,
                    inline: true
                },
                {
                    name: '📨 Canal de Envio',
                    value: config.suggestionsChannel ? `<#${config.suggestionsChannel}>` : 'Não configurado',
                    inline: true
                },
                {
                    name: '📋 Canal de Recebimento',
                    value: config.receiveChannel ? `<#${config.receiveChannel}>` : 'Não configurado',
                    inline: true
                },
                {
                    name: '⚙️ Status',
                    value: '✅ Sistema Ativo',
                    inline: true
                },
                {
                    name: '📅 Configurado em',
                    value: config.configuredAt ? formatDate(config.configuredAt) : 'Desconhecido',
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [statsEmbed] });
    }
    
    // ============================================
    // COMANDO: !serverstats
    // ============================================
    if (commandName === 'serverstats') {
        const guild = message.guild;
        
        const serverStatsEmbed = createEmbed(
            `📊 Estatísticas de ${guild.name}`,
            'Estatísticas detalhadas do servidor',
            '#5865F2',
            [
                {
                    name: '👥 Total de Membros',
                    value: `${guild.memberCount}`,
                    inline: true
                },
                {
                    name: '🟢 Membros Online',
                    value: `${guild.members.cache.filter(m => m.presence?.status === 'online').size}`,
                    inline: true
                },
                {
                    name: '🟡 Membros Ausentes',
                    value: `${guild.members.cache.filter(m => m.presence?.status === 'idle').size}`,
                    inline: true
                },
                {
                    name: '🔴 Membros Ocupados',
                    value: `${guild.members.cache.filter(m => m.presence?.status === 'dnd').size}`,
                    inline: true
                },
                {
                    name: '⚫ Membros Offline',
                    value: `${guild.memberCount - guild.members.cache.filter(m => m.presence?.status !== 'offline').size}`,
                    inline: true
                },
                {
                    name: '🤖 Bots',
                    value: `${guild.members.cache.filter(m => m.user.bot).size}`,
                    inline: true
                },
                {
                    name: '💬 Canais de Texto',
                    value: `${guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size}`,
                    inline: true
                },
                {
                    name: '🔊 Canais de Voz',
                    value: `${guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size}`,
                    inline: true
                },
                {
                    name: '📢 Canais de Anúncio',
                    value: `${guild.channels.cache.filter(c => c.type === ChannelType.GuildAnnouncement).size}`,
                    inline: true
                },
                {
                    name: '🎨 Cargos',
                    value: `${guild.roles.cache.size}`,
                    inline: true
                },
                {
                    name: '😊 Emojis',
                    value: `${guild.emojis.cache.size}`,
                    inline: true
                },
                {
                    name: '🎫 Emojis Animados',
                    value: `${guild.emojis.cache.filter(e => e.animated).size}`,
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [serverStatsEmbed] });
    }
    
    // ============================================
    // COMANDO: !userstats
    // ============================================
    if (commandName === 'userstats') {
        const user = message.mentions.users.first() || message.author;
        const guildId = message.guild.id;
        
        const userSuggestions = suggestionManager.getUserSuggestions(guildId, user.id);
        const suggestionCount = userSuggestions.length;
        
        let totalVotes = { up: 0, down: 0 };
        for (const sug of userSuggestions) {
            totalVotes.up += sug.votes.up;
            totalVotes.down += sug.votes.down;
        }
        
        const userStatsEmbed = createEmbed(
            `📊 Estatísticas de ${user.username}`,
            'Estatísticas de sugestões do usuário',
            '#5865F2',
            [
                {
                    name: '💡 Sugestões Enviadas',
                    value: `${suggestionCount}`,
                    inline: true
                },
                {
                    name: '👍 Votos Positivos Recebidos',
                    value: `${totalVotes.up}`,
                    inline: true
                },
                {
                    name: '👎 Votos Negativos Recebidos',
                    value: `${totalVotes.down}`,
                    inline: true
                },
                {
                    name: '📊 Média de Votos por Sugestão',
                    value: suggestionCount > 0 ? ((totalVotes.up + totalVotes.down) / suggestionCount).toFixed(2) : '0',
                    inline: true
                },
                {
                    name: '⭐ Taxa de Aprovação',
                    value: suggestionCount > 0 ? `${((totalVotes.up / (totalVotes.up + totalVotes.down || 1)) * 100).toFixed(1)}%` : '0%',
                    inline: true
                }
            ]
        ).setThumbnail(user.displayAvatarURL({ dynamic: true }));
        
        return message.reply({ embeds: [userStatsEmbed] });
    }
    
    // ============================================
    // COMANDO: !topsuggestions / !top
    // ============================================
    if (commandName === 'topsuggestions' || commandName === 'top') {
        const guildId = message.guild.id;
        const allSuggestions = [];
        
        const userSuggestions = suggestionManager.userSuggestions.get(guildId);
        if (userSuggestions) {
            for (const suggestions of userSuggestions.values()) {
                allSuggestions.push(...suggestions);
            }
        }
        
        if (allSuggestions.length === 0) {
            return message.reply({
                embeds: [createEmbed(
                    '🏆 Top Sugestões',
                    'Nenhuma sugestão foi enviada ainda.',
                    '#5865F2'
                )]
            });
        }
        
        const topSuggestions = allSuggestions
            .sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down))
            .slice(0, 10);
        
        const topList = topSuggestions.map((sug, index) => {
            return `**${index + 1}.** ${sug.content.substring(0, 40)}${sug.content.length > 40 ? '...' : ''}\n` +
                   `👍 ${sug.votes.up} | 👎 ${sug.votes.down} | 📊 Score: ${sug.votes.up - sug.votes.down}\n` +
                   `👤 <@${sug.userId}> | 🆔 ${sug.id}`;
        }).join('\n\n');
        
        const topEmbed = createEmbed(
            '🏆 Top 10 Sugestões',
            'Sugestões mais bem votadas do servidor',
            '#FFD700',
            [
                {
                    name: '📊 Ranking',
                    value: topList || 'Nenhuma sugestão',
                    inline: false
                }
            ]
        );
        
        return message.reply({ embeds: [topEmbed] });
    }
    
    // ============================================
    // COMANDO: !suggestioninfo
    // ============================================
    if (commandName === 'suggestioninfo') {
        const suggestionId = args[0];
        
        if (!suggestionId) {
            return message.reply({
                embeds: [createErrorEmbed('Por favor, forneça o ID da sugestão.\nExemplo: `!suggestioninfo abc123xyz`')]
            });
        }
        
        const guildId = message.guild.id;
        const suggestion = suggestionManager.getSuggestion(guildId, suggestionId);
        
        if (!suggestion) {
            return message.reply({
                embeds: [createErrorEmbed('Sugestão não encontrada. Verifique o ID.')]
            });
        }
        
        const suggestionInfoEmbed = createEmbed(
            '📋 Informações da Sugestão',
            suggestion.content,
            '#5865F2',
            [
                {
                    name: '🆔 ID',
                    value: suggestion.id,
                    inline: true
                },
                {
                    name: '👤 Autor',
                    value: `<@${suggestion.userId}>`,
                    inline: true
                },
                {
                    name: '📅 Data',
                    value: formatDate(suggestion.timestamp),
                    inline: true
                },
                {
                    name: '📊 Votos',
                    value: `👍 ${suggestion.votes.up} | 👎 ${suggestion.votes.down}`,
                    inline: true
                },
                {
                    name: '⭐ Score',
                    value: `${suggestion.votes.up - suggestion.votes.down}`,
                    inline: true
                },
                {
                    name: '👥 Total de Votantes',
                    value: `${suggestion.voters.size}`,
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [suggestionInfoEmbed] });
    }
    
    // ============================================
    // COMANDO: !setup
    // ============================================
    if (commandName === 'setup') {
        const setupEmbed = createEmbed(
            '⚙️ Configuração do Sistema de Sugestões',
            'Siga os passos abaixo para configurar o sistema:',
            '#5865F2',
            [
                {
                    name: '1️⃣ Configurar Canal de Sugestões',
                    value: 'Use `/suggestions #canal` para definir o canal onde os usuários poderão enviar sugestões.',
                    inline: false
                },
                {
                    name: '2️⃣ Configurar Canal de Recebimento',
                    value: 'Use `/suggestionschannel #canal` para definir o canal onde as sugestões serão enviadas.',
                    inline: false
                },
                {
                    name: '3️⃣ Permissões',
                    value: 'Apenas o dono do bot (OWNER_ID) pode usar os comandos de configuração.',
                    inline: false
                },
                {
                    name: '4️⃣ Comandos',
                    value: 'Após configurado, os usuários poderão usar `!suggest` para enviar sugestões.',
                    inline: false
                },
                {
                    name: '5️⃣ Votação',
                    value: 'As sugestões receberão automaticamente reações 👍 e 👎 para votação.',
                    inline: false
                },
                {
                    name: '📌 Status Atual',
                    value: suggestionsConfig[message.guild.id] ? '✅ Sistema configurado' : '❌ Sistema não configurado',
                    inline: false
                }
            ]
        );
        
        return message.reply({ embeds: [setupEmbed] });
    }
    
    // ============================================
    // COMANDO: !config
    // ============================================
    if (commandName === 'config') {
        const guildId = message.guild.id;
        const config = suggestionsConfig[guildId];
        
        if (!config) {
            return message.reply({
                embeds: [createEmbed(
                    '⚙️ Configurações Atuais',
                    'O sistema de sugestões não está configurado neste servidor.\nUse `!setup` para ver como configurar.',
                    '#5865F2'
                )]
            });
        }
        
        const configEmbed = createEmbed(
            '⚙️ Configurações Atuais',
            'Aqui estão as configurações do sistema de sugestões:',
            '#5865F2',
            [
                {
                    name: '📨 Canal de Sugestões',
                    value: config.suggestionsChannel ? `<#${config.suggestionsChannel}>` : 'Não configurado',
                    inline: true
                },
                {
                    name: '📋 Canal de Recebimento',
                    value: config.receiveChannel ? `<#${config.receiveChannel}>` : 'Não configurado',
                    inline: true
                },
                {
                    name: '📅 Configurado em',
                    value: config.configuredAt ? formatDate(config.configuredAt) : 'Desconhecido',
                    inline: true
                },
                {
                    name: '⚙️ Status',
                    value: config.suggestionsChannel && config.receiveChannel ? '✅ Completo' : '⚠️ Incompleto',
                    inline: true
                }
            ]
        );
        
        return message.reply({ embeds: [configEmbed] });
    }
    
    // ============================================
    // COMANDO: !resetconfig (Apenas Owner)
    // ============================================
    if (commandName === 'resetconfig') {
        if (!isOwner(message.author.id)) {
            return message.reply({
                embeds: [createErrorEmbed('Apenas o dono do bot pode usar este comando.')]
            });
        }
        
        const guildId = message.guild.id;
        
        if (suggestionsConfig[guildId]) {
            delete suggestionsConfig[guildId];
            saveConfig();
            
            return message.reply({
                embeds: [createSuccessEmbed('Configurações do sistema de sugestões foram resetadas com sucesso!')]
            });
        } else {
            return message.reply({
                embeds: [createErrorEmbed('Não há configurações para resetar neste servidor.')]
            });
        }
    }
    
    // ============================================
    // COMANDO DESCONHECIDO
    // ============================================
    const validCommands = [
        'help', 'ajuda', 'comandos', 'ping', 'info', 'botinfo', 'invite', 'convite',
        'support', 'suporte', 'avatar', 'userinfo', 'serverinfo', 'suggest', 'sugestao',
        'sugerir', 'mysuggestions', 'minhas', 'stats', 'estatisticas', 'serverstats',
        'userstats', 'topsuggestions', 'top', 'suggestioninfo', 'setup', 'config', 'resetconfig'
    ];
    
    if (!validCommands.includes(commandName)) {
        return message.reply({
            embeds: [createErrorEmbed(`Comando desconhecido. Use \`!help\` para ver todos os comandos disponíveis.`)]
        });
    }
});

// ============================================
// COMANDOS SLASH (APENAS OS 2 SOLICITADOS)
// ============================================

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = interaction.commandName;
    
    // ===== INCREMENTAR CONTADOR =====
    totalComandosExecutados++;
    
    if (!isOwner(interaction.user.id)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Apenas o dono do bot pode usar este comando.')],
            ephemeral: true
        });
    }
    
    // ============================================
    // COMANDO SLASH: /suggestions
    // ============================================
    if (command === 'suggestions') {
        const channel = interaction.options.getChannel('channel');
        
        if (channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                embeds: [createErrorEmbed('Por favor, selecione um canal de texto válido.')],
                ephemeral: true
            });
        }
        
        const guildId = interaction.guild.id;
        if (!suggestionsConfig[guildId]) {
            suggestionsConfig[guildId] = {};
        }
        suggestionsConfig[guildId].suggestionsChannel = channel.id;
        suggestionsConfig[guildId].configuredAt = Date.now();
        saveConfig();
        
        const explanationEmbed = createEmbed(
            '💡 Sistema de Sugestões - InsightBot',
            'Bem-vindo ao sistema de sugestões! Veja como funciona:',
            '#5865F2',
            [
                {
                    name: '📝 Como enviar uma sugestão',
                    value: 'Clique no botão "Enviar Sugestão" abaixo e preencha o formulário com sua ideia.',
                    inline: false
                },
                {
                    name: '👍 Sistema de Votação',
                    value: 'Após enviada, sua sugestão será postada em um canal especial onde outros membros poderão votar usando 👍 ou 👎.',
                    inline: false
                },
                {
                    name: '📊 Regras',
                    value: '• Sugestões devem ser construtivas\n• Respeite outros membros\n• Sem spam ou conteúdo impróprio\n• Mínimo de 10 caracteres',
                    inline: false
                },
                {
                    name: '🎯 Objetivo',
                    value: 'Ajudar a melhorar o servidor com ideias da comunidade!',
                    inline: false
                },
                {
                    name: '⚡ Dica',
                    value: 'Use `!suggest [sua sugestão]` para enviar sugestões diretamente também!',
                    inline: false
                },
                {
                    name: '📚 Comandos Disponíveis',
                    value: '`!help` - Ver todos os comandos\n`!mysuggestions` - Ver suas sugestões\n`!stats` - Ver estatísticas',
                    inline: false
                }
            ]
        );
        
        const button = new ButtonBuilder()
            .setCustomId('send_suggestion')
            .setLabel('Enviar Sugestão')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💡');
        
        const row = new ActionRowBuilder().addComponents(button);
        
        await channel.send({
            embeds: [explanationEmbed],
            components: [row]
        });
        
        const confirmEmbed = createSuccessEmbed(
            `Sistema de sugestões configurado com sucesso!\n\n` +
            `**Canal de sugestões:** ${channel}\n` +
            `**Canal de recebimento:** ${suggestionsConfig[guildId].receiveChannel ? `<#${suggestionsConfig[guildId].receiveChannel}>` : 'Não configurado'}`
        );
        
        return interaction.reply({
            embeds: [confirmEmbed],
            ephemeral: true
        });
    }
    
    // ============================================
    // COMANDO SLASH: /suggestionschannel
    // ============================================
    if (command === 'suggestionschannel') {
        const channel = interaction.options.getChannel('channel');
        
        if (channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                embeds: [createErrorEmbed('Por favor, selecione um canal de texto válido.')],
                ephemeral: true
            });
        }
        
        const guildId = interaction.guild.id;
        if (!suggestionsConfig[guildId]) {
            suggestionsConfig[guildId] = {};
        }
        suggestionsConfig[guildId].receiveChannel = channel.id;
        suggestionsConfig[guildId].configuredAt = Date.now();
        saveConfig();
        
        const testEmbed = createEmbed(
            '📋 Canal de Sugestões Configurado',
            'Este canal receberá todas as sugestões enviadas pelos membros.',
            '#00FF00',
            [
                {
                    name: '📊 Como funciona',
                    value: 'As sugestões serão postadas aqui automaticamente com reações para votação.',
                    inline: false
                },
                {
                    name: '👍 Votação',
                    value: 'Membros podem votar usando as reações 👍 (positivo) e 👎 (negativo).',
                    inline: false
                },
                {
                    name: '⚙️ Configuração',
                    value: `Canal configurado por <@${interaction.user.id}>`,
                    inline: false
                },
                {
                    name: '📌 Status',
                    value: suggestionsConfig[guildId].suggestionsChannel ? '✅ Sistema completo' : '⚠️ Configure também o canal de sugestões com `/suggestions`',
                    inline: false
                }
            ]
        );
        
        await channel.send({ embeds: [testEmbed] });
        
        const confirmEmbed = createSuccessEmbed(
            `Canal de recebimento configurado com sucesso!\n\n` +
            `**Canal de sugestões:** ${suggestionsConfig[guildId].suggestionsChannel ? `<#${suggestionsConfig[guildId].suggestionsChannel}>` : 'Não configurado'}\n` +
            `**Canal de recebimento:** ${channel}`
        );
        
        return interaction.reply({
            embeds: [confirmEmbed],
            ephemeral: true
        });
    }
});

// Handler para botões
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'send_suggestion') {
        // ===== INCREMENTAR CONTADOR =====
        totalComandosExecutados++;
        
        const modal = new ModalBuilder()
            .setCustomId('suggestion_modal')
            .setTitle('Enviar Sugestão');
        
        const suggestionInput = new TextInputBuilder()
            .setCustomId('suggestion_content')
            .setLabel('Sua sugestão')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Descreva sua sugestão em detalhes...')
            .setMinLength(10)
            .setMaxLength(1000)
            .setRequired(true);
        
        const firstRow = new ActionRowBuilder().addComponents(suggestionInput);
        modal.addComponents(firstRow);
        
        return interaction.showModal(modal);
    }
});

// Handler para modals
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    
    if (interaction.customId === 'suggestion_modal') {
        // ===== INCREMENTAR CONTADOR =====
        totalComandosExecutados++;
        
        const content = interaction.fields.getTextInputValue('suggestion_content');
        const guildId = interaction.guild.id;
        const config = suggestionsConfig[guildId];
        
        if (!config || !config.receiveChannel) {
            return interaction.reply({
                embeds: [createErrorEmbed('Erro na configuração do sistema. Contate um administrador.')],
                ephemeral: true
            });
        }
        
        const suggestion = suggestionManager.addSuggestion(guildId, interaction.user.id, content);
        
        const receiveChannel = interaction.guild.channels.cache.get(config.receiveChannel);
        if (receiveChannel) {
            const suggestionEmbed = createEmbed(
                '💡 Nova Sugestão',
                content,
                '#5865F2',
                [
                    {
                        name: '👤 Autor',
                        value: `${interaction.user.tag}`,
                        inline: true
                    }
                ]
            );
            
            const sentMessage = await receiveChannel.send({ embeds: [suggestionEmbed] });
            await sentMessage.react('👍');
            await sentMessage.react('👎');
        }
        
        const confirmEmbed = createSuccessEmbed(
            `Sua sugestão foi enviada com sucesso!\n\n**ID:** ${suggestion.id}\n**Sugestão:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
        );
        
        return interaction.reply({
            embeds: [confirmEmbed],
            ephemeral: true
        });
    }
});

// ============================================
// EVENTOS DO BOT
// ============================================

client.once(Events.ClientReady, async () => {
    console.log('============================================');
    console.log(`🤖 ${client.user.tag} está online!`);
    console.log(`📊 Servidores: ${client.guilds.cache.size}`);
    console.log(`👥 Usuários: ${client.users.cache.size}`);
    console.log(`📡 Ping: ${client.ws.ping}ms`);
    console.log('============================================');
    
    // ===== HEARTBEAT =====
    sendHeartbeat(client);
    setInterval(() => sendHeartbeat(client), 5 * 60 * 1000);
    // ===== FIM HEARTBEAT =====
    
    client.user.setPresence({
        activities: [{ 
            name: '!help para comandos', 
            type: ActivityType.Watching 
        }],
        status: PresenceUpdateStatus.Online
    });
    
    const commands = [
        {
            name: 'suggestions',
            description: 'Configura o canal de sugestões (apenas owner)',
            options: [
                {
                    name: 'channel',
                    description: 'Canal onde o embed de sugestões será enviado',
                    type: 7,
                    required: true,
                    channel_types: [0]
                }
            ]
        },
        {
            name: 'suggestionschannel',
            description: 'Configura o canal de recebimento de sugestões (apenas owner)',
            options: [
                {
                    name: 'channel',
                    description: 'Canal onde as sugestões serão enviadas',
                    type: 7,
                    required: true,
                    channel_types: [0]
                }
            ]
        }
    ];
    
    try {
        console.log('📝 Registrando comandos slash...');
        await client.application.commands.set(commands);
        console.log('✅ Comandos slash registrados com sucesso!');
        console.log('📋 Comandos registrados: /suggestions, /suggestionschannel');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos slash:', error);
    }
    
    await sendStartupMessage();
    
    setInterval(() => {
        const statuses = [
            { name: '!help', type: ActivityType.Watching },
            { name: '𝙼𝚊𝚍𝚎 𝙱𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝', type: ActivityType.Playing }
        ];
        
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        client.user.setPresence({
            activities: [{ name: randomStatus.name, type: randomStatus.type }],
            status: PresenceUpdateStatus.Online
        });
    }, 30000);
});

// Evento quando o bot entra em um novo servidor
client.on(Events.GuildCreate, async (guild) => {
    console.log(`🎉 Entrou no servidor: ${guild.name} (${guild.id})`);
    
    const channel = guild.systemChannel || 
                   guild.channels.cache.find(ch => 
                       ch.type === ChannelType.GuildText && 
                       ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
                   );
    
    if (channel) {
        const welcomeEmbed = createEmbed(
            '🎉 InsightBot Chegou!',
            'Obrigado por me adicionar ao seu servidor!',
            '#5865F2',
            [
                {
                    name: '🚀 Começando',
                    value: 'Use `!help` para ver todos os comandos disponíveis.',
                    inline: false
                },
                {
                    name: '⚙️ Configuração',
                    value: 'Para configurar o sistema de sugestões, use:\n`/suggestions #canal` - Define o canal de sugestões\n`/suggestionschannel #canal` - Define o canal de recebimento',
                    inline: false
                },
                {
                    name: '📌 Nota',
                    value: 'Apenas o dono do bot pode usar comandos de configuração.',
                    inline: false
                },
                {
                    name: '💡 Dica',
                    value: 'Use `!setup` para ver um guia completo de configuração!',
                    inline: false
                }
            ]
        );
        
        await channel.send({ embeds: [welcomeEmbed] });
    }
});

// Evento quando o bot é removido de um servidor
client.on(Events.GuildDelete, (guild) => {
    console.log(`👋 Removido do servidor: ${guild.name} (${guild.id})`);
    
    if (suggestionsConfig[guild.id]) {
        delete suggestionsConfig[guild.id];
        saveConfig();
        console.log(`🧹 Configurações removidas para o servidor ${guild.name}`);
    }
});

// Evento para reações em mensagens
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    if (reaction.message.embeds.length > 0) {
        const embed = reaction.message.embeds[0];
        if (embed.title === '💡 Nova Sugestão' || embed.title?.includes('Sugestão')) {
            if (!['👍', '👎'].includes(reaction.emoji.name)) {
                await reaction.users.remove(user.id);
            }
        }
    }
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado (Promise):', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Erro não tratado (Exception):', error);
});

client.on(Events.Error, (error) => {
    console.error('❌ Erro no cliente Discord:', error);
});

client.on(Events.ShardError, (error) => {
    console.error('❌ Erro no shard:', error);
});

client.on(Events.Warn, (warning) => {
    console.warn('⚠️ Warning:', warning);
});

if (process.env.NODE_ENV === 'development') {
    client.on(Events.Debug, (info) => {
        console.log('🐛 Debug:', info);
    });
}

// ============================================
// FUNÇÕES ADICIONAIS
// ============================================

setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of prefixCooldowns) {
        if (now > timestamp) {
            prefixCooldowns.delete(userId);
        }
    }
    console.log('🧹 Cache limpo periodicamente');
}, 3600000);

setInterval(() => {
    saveConfig();
    console.log('💾 Backup automático das configurações realizado');
}, 1800000);

// ============================================
// SERVIDOR UNIFICADO (BOT + DASHBOARD + HEALTH CHECK)
// ============================================
const mainApp = express();
const UNIFIED_PORT = process.env.PORT || 8080;

// ===== CONFIGURAÇÃO DA SESSÃO =====
mainApp.use(session({
    secret: process.env.SESSION_SECRET || 'dashboard_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// ===== PASSPORT =====
mainApp.use(passport.initialize());
mainApp.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI || 'http://localhost:8080/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

// ===== MIDDLEWARES =====
mainApp.use(express.json());
mainApp.use(express.urlencoded({ extended: true }));
mainApp.use(express.static(path.join(__dirname, 'dashboard', 'public')));
mainApp.set('view engine', 'ejs');
mainApp.set('views', path.join(__dirname, 'dashboard', 'views'));

// Middleware de autenticação
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
}

// ===== ROTAS DA DASHBOARD =====

// Health Check
mainApp.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        bot: client.isReady() ? 'online' : 'offline',
        dashboard: 'online',
        uptime: client.uptime,
        servers: client.guilds.cache.size,
        users: client.users.cache.size,
        commands: totalComandosExecutados,
        timestamp: new Date().toISOString()
    });
});

// Página inicial
mainApp.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Login
mainApp.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('login', { user: req.user, error: null });
});

// Login com Discord
mainApp.get('/auth/discord', passport.authenticate('discord'));

// Callback do Discord
mainApp.get('/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/login',
        successRedirect: '/dashboard'
    })
);

// Logout
mainApp.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// Dashboard principal
mainApp.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.user.accessToken}` }
        });
        const guilds = await response.json();
        
        const adminGuilds = guilds.filter(g => (g.permissions & 0x8) === 0x8);
        
        res.render('dashboard', {
            user: req.user,
            guilds: adminGuilds,
            botStatus: {
                botsOnline: client.isReady() ? 1 : 0,
                totalServidores: client.guilds.cache.size,
                totalUsuarios: client.users.cache.size,
                ping: client.ws.ping
            },
            currentPage: 'dashboard',
            error: null
        });
    } catch (error) {
        res.render('dashboard', {
            user: req.user,
            guilds: [],
            botStatus: { botsOnline: 0, totalServidores: 0, totalUsuarios: 0, ping: 0 },
            currentPage: 'dashboard',
            error: 'Erro ao carregar servidores'
        });
    }
});

// Dashboard de servidor específico
mainApp.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
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
        
        const guild = client.guilds.cache.get(guildId);
        let channels = [];
        if (guild) {
            channels = guild.channels.cache
                .filter(c => c.type === 0)
                .map(c => ({ id: c.id, name: c.name }))
                .slice(0, 50);
        }
        
        const botConfig = suggestionsConfig[guildId] || { suggestionsChannel: null, receiveChannel: null };
        
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
mainApp.post('/api/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const { guildId } = req.params;
    const config = req.body;
    
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
    
    if (!suggestionsConfig[guildId]) {
        suggestionsConfig[guildId] = {};
    }
    
    if (config.suggestionsChannel !== undefined) {
        suggestionsConfig[guildId].suggestionsChannel = config.suggestionsChannel;
    }
    if (config.receiveChannel !== undefined) {
        suggestionsConfig[guildId].receiveChannel = config.receiveChannel;
    }
    suggestionsConfig[guildId].configuredAt = Date.now();
    
    saveConfig();
    
    res.json({ success: true, message: 'Configurações salvas com sucesso!' });
});

// Rota 404
mainApp.use((req, res) => {
    res.status(404).render('error', { 
        user: req.user, 
        error: 'Página não encontrada' 
    });
});

// Iniciar servidor unificado
mainApp.listen(UNIFIED_PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 INSIGHTBOT + DASHBOARD - SERVIDOR UNIFICADO      ║
╠══════════════════════════════════════════════════════════╣
║  📡 Servidor: http://localhost:${UNIFIED_PORT}
║  🎛️ Dashboard: http://localhost:${UNIFIED_PORT}/dashboard
║  🔐 Login: http://localhost:${UNIFIED_PORT}/login
║  ❤️ Health: http://localhost:${UNIFIED_PORT}/health
╚══════════════════════════════════════════════════════════╝
    `);
});

// ===== INICIAR O BOT =====
console.log('🚀 Iniciando InsightBot...');
console.log('📋 Comandos Slash: /suggestions, /suggestionschannel');
console.log('📋 Comandos Prefixo: !help, !ping, !info, !suggest, etc.');
console.log('📡 Heartbeat configurado para: ' + BOT_CONFIG.apiUrl);
console.log('============================================');

client.login(TOKEN).catch(error => {
    console.error('❌ Erro ao fazer login:', error);
    console.error('Verifique se o TOKEN está correto no arquivo .env');
    process.exit(1);
});

module.exports = {
    client,
    suggestionManager,
    suggestionsConfig,
    saveConfig,
    createEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    formatDate,
    isOwner
};