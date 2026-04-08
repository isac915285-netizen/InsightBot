// index.js - Bot de Sugestões para Discord
// Versão: 2.0.0
// Desenvolvido com Discord.js v14

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
    SlashCommandBuilder,
    REST,
    Routes,
    Events
} = require('discord.js');

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================
// CONFIGURAÇÕES INICIAIS E VARIÁVEIS DE AMBIENTE
// ============================================

const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PREFIX = '!';
const CLIENT_ID = process.env.CLIENT_ID;

// Validação das variáveis de ambiente
if (!TOKEN || !OWNER_ID) {
    console.error('\x1b[31m%s\x1b[0m', '❌ ERRO CRÍTICO: Variáveis de ambiente TOKEN e OWNER_ID são obrigatórias!');
    console.error('\x1b[33m%s\x1b[0m', '📝 Crie um arquivo .env com as seguintes variáveis:');
    console.error('\x1b[36m%s\x1b[0m', '   TOKEN=seu_token_aqui');
    console.error('\x1b[36m%s\x1b[0m', '   OWNER_ID=seu_id_do_discord');
    console.error('\x1b[36m%s\x1b[0m', '   CLIENT_ID=id_do_seu_bot (opcional para deploy global)');
    process.exit(1);
}

// ============================================
// INICIALIZAÇÃO DO CLIENTE DISCORD
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.GuildScheduledEvent
    ],
    allowedMentions: {
        parse: ['users', 'roles'],
        repliedUser: true
    },
    presence: {
        status: 'online',
        activities: [{
            name: '📊 Sistema de Sugestões',
            type: 3 // WATCHING
        }]
    }
});

// ============================================
// COLLECTIONS E ARMAZENAMENTO
// ============================================

client.commands = new Collection();
client.prefixCommands = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();
client.suggestionsConfig = new Map(); // Armazena configurações por servidor
client.suggestionsCount = new Map(); // Contador de sugestões por servidor
client.userSuggestions = new Map(); // Sugestões por usuário para rate limiting
client.activeModals = new Map(); // Modais ativos
client.activeButtons = new Map(); // Botões ativos

// Configurações padrão
const DEFAULT_CONFIG = {
    suggestionsChannel: null,
    outputChannel: null,
    cooldown: 30000, // 30 segundos
    maxSuggestionsPerDay: 10,
    requireApproval: false,
    allowAnonymous: true,
    minLength: 10,
    maxLength: 1000,
    embedColor: '#5865F2',
    footerText: 'Sistema de Sugestões',
    reactions: {
        upvote: '👍',
        downvote: '👎'
    },
    notifications: {
        onSuggestion: true,
        onApproval: true,
        onRejection: true
    }
};

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

class Logger {
    static info(message) {
        console.log('\x1b[36m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] ℹ️ ${message}`);
    }
    
    static success(message) {
        console.log('\x1b[32m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] ✅ ${message}`);
    }
    
    static warn(message) {
        console.log('\x1b[33m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] ⚠️ ${message}`);
    }
    
    static error(message) {
        console.log('\x1b[31m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] ❌ ${message}`);
    }
    
    static debug(message) {
        if (process.env.DEBUG === 'true') {
            console.log('\x1b[35m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] 🔍 ${message}`);
        }
    }
    
    static command(user, command, args = '') {
        console.log('\x1b[90m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] 👤 ${user} executou: ${command} ${args}`);
    }
}

class Utils {
    static formatDuration(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (seconds > 0) parts.push(`${seconds}s`);
        
        return parts.join(' ') || '0s';
    }
    
    static validateChannel(guild, channelId, type = null) {
        try {
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return false;
            if (type && channel.type !== type) return false;
            return true;
        } catch {
            return false;
        }
    }
    
    static escapeMarkdown(text) {
        return text.replace(/([*_~`|])/g, '\\$1');
    }
    
    static truncate(text, maxLength = 1000) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
    
    static generateId(prefix = '') {
        return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    static async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    static chunkArray(array, size) {
        const chunked = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    }
}

class PermissionManager {
    static isOwner(userId) {
        return userId === OWNER_ID;
    }
    
    static hasAdminPermission(member) {
        return member.permissions.has(PermissionsBitField.Flags.Administrator);
    }
    
    static hasManageGuild(member) {
        return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    }
    
    static canManageSuggestions(member, config) {
        if (this.isOwner(member.id)) return true;
        if (this.hasAdminPermission(member)) return true;
        if (this.hasManageGuild(member)) return true;
        return false;
    }
}

// ============================================
// GESTÃO DE CONFIGURAÇÕES
// ============================================

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, 'suggestions_config.json');
        this.loadConfig();
    }
    
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                for (const [guildId, config] of Object.entries(data)) {
                    client.suggestionsConfig.set(guildId, { ...DEFAULT_CONFIG, ...config });
                }
                Logger.success('Configurações carregadas com sucesso!');
            } else {
                Logger.warn('Arquivo de configurações não encontrado. Usando padrões.');
            }
        } catch (error) {
            Logger.error(`Erro ao carregar configurações: ${error.message}`);
        }
    }
    
    saveConfig() {
        try {
            const config = {};
            for (const [guildId, settings] of client.suggestionsConfig) {
                config[guildId] = settings;
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            Logger.debug('Configurações salvas com sucesso!');
        } catch (error) {
            Logger.error(`Erro ao salvar configurações: ${error.message}`);
        }
    }
    
    getConfig(guildId) {
        if (!client.suggestionsConfig.has(guildId)) {
            client.suggestionsConfig.set(guildId, { ...DEFAULT_CONFIG });
            this.saveConfig();
        }
        return client.suggestionsConfig.get(guildId);
    }
    
    updateConfig(guildId, updates) {
        const current = this.getConfig(guildId);
        const updated = { ...current, ...updates };
        client.suggestionsConfig.set(guildId, updated);
        this.saveConfig();
        return updated;
    }
    
    resetConfig(guildId) {
        client.suggestionsConfig.set(guildId, { ...DEFAULT_CONFIG });
        this.saveConfig();
        return DEFAULT_CONFIG;
    }
}

const configManager = new ConfigManager();

// ============================================
// CRIAÇÃO DE EMBEDS E COMPONENTES
// ============================================

class EmbedBuilder {
    static suggestionEmbed(suggestion, config, user) {
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`💡 Sugestão #${suggestion.id}`)
            .setDescription(Utils.truncate(suggestion.content, 4000))
            .setTimestamp()
            .setFooter({ text: config.footerText });
        
        if (suggestion.anonymous) {
            embed.setAuthor({ name: 'Sugestão Anônima', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' });
        } else {
            embed.setAuthor({ 
                name: user.username, 
                iconURL: user.displayAvatarURL({ dynamic: true }) 
            });
        }
        
        if (suggestion.attachments && suggestion.attachments.length > 0) {
            embed.addFields({
                name: '📎 Anexos',
                value: suggestion.attachments.map((url, i) => `[Anexo ${i + 1}](${url})`).join('\n'),
                inline: false
            });
        }
        
        embed.addFields(
            { name: '📊 Status', value: '🟡 Pendente', inline: true },
            { name: '👍 Votos', value: '0', inline: true },
            { name: '👎 Votos', value: '0', inline: true }
        );
        
        return embed;
    }
    
    static configEmbed(config, guild) {
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('⚙️ Configurações do Sistema de Sugestões')
            .setDescription('Configurações atuais do bot para este servidor:')
            .addFields(
                { 
                    name: '📝 Canal de Sugestões', 
                    value: config.suggestionsChannel ? `<#${config.suggestionsChannel}>` : '❌ Não configurado',
                    inline: true 
                },
                { 
                    name: '📤 Canal de Envio', 
                    value: config.outputChannel ? `<#${config.outputChannel}>` : '❌ Não configurado',
                    inline: true 
                },
                { 
                    name: '⏱️ Cooldown', 
                    value: Utils.formatDuration(config.cooldown),
                    inline: true 
                },
                { 
                    name: '📊 Limite Diário', 
                    value: `${config.maxSuggestionsPerDay} sugestões`,
                    inline: true 
                },
                { 
                    name: '👤 Anônimo', 
                    value: config.allowAnonymous ? '✅ Permitido' : '❌ Não permitido',
                    inline: true 
                },
                { 
                    name: '✏️ Tamanho', 
                    value: `${config.minLength}-${config.maxLength} caracteres`,
                    inline: true 
                }
            )
            .setTimestamp()
            .setFooter({ text: `Servidor: ${guild.name}` });
        
        return embed;
    }
    
    static helpEmbed(prefix) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📚 Comandos do Bot de Sugestões')
            .setDescription('Aqui estão todos os comandos disponíveis:')
            .addFields(
                {
                    name: '🔷 Comandos Slash (/)',
                    value: [
                        '`/suggestions canal:<canal>` - Configura o canal de sugestões',
                        '`/suggestionschannel canal:<canal>` - Configura o canal de envio',
                        '`/suggest` - Abre modal para enviar sugestão',
                        '`/config` - Mostra configurações atuais',
                        '`/help` - Mostra esta mensagem'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: `🔶 Comandos de Prefixo (${prefix})`,
                    value: [
                        '`!ping` - Mostra latência do bot',
                        '`!uptime` - Mostra tempo online',
                        '`!stats` - Estatísticas do bot',
                        '`!config` - Configurações do servidor',
                        '`!reset` - Reseta configurações',
                        '`!info` - Informações do bot',
                        '`!suggest` - Envia uma sugestão',
                        '`!invite` - Link de convite do bot',
                        '`!serverinfo` - Info do servidor',
                        '`!userinfo` - Info do usuário'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '👑 Comandos do Owner',
                    value: [
                        '`!eval` - Executa código JavaScript',
                        '`!reload` - Recarrega comandos',
                        '`!shutdown` - Desliga o bot',
                        '`!servers` - Lista servidores',
                        '`!blacklist` - Gerencia blacklist',
                        '`!announce` - Anúncio global'
                    ].join('\n'),
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ text: 'Desenvolvido com ❤️ para Discord' });
        
        return embed;
    }
    
    static welcomeEmbed(guild) {
        return new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Bot de Sugestões Online!')
            .setDescription([
                'Obrigado por me adicionar ao seu servidor!',
                '',
                'Para começar a usar o sistema de sugestões, configure os canais:',
                '1. Use `/suggestions` para definir o canal onde os usuários enviarão sugestões',
                '2. Use `/suggestionschannel` para definir onde as sugestões serão postadas',
                '',
                'Digite `/help` para ver todos os comandos disponíveis!'
            ].join('\n'))
            .setTimestamp();
    }
}

class ComponentBuilder {
    static createSuggestionButton() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_suggestion')
                    .setLabel('📝 Enviar Sugestão')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💡')
            );
    }
    
    static createVoteButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('vote_up')
                    .setLabel('👍')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('vote_down')
                    .setLabel('👎')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('suggestion_info')
                    .setLabel('ℹ️ Info')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('report_suggestion')
                    .setLabel('🚩 Reportar')
                    .setStyle(ButtonStyle.Secondary)
            );
    }
    
    static createConfigButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('toggle_anonymous')
                    .setLabel('Alternar Anônimo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👤'),
                new ButtonBuilder()
                    .setCustomId('set_cooldown')
                    .setLabel('Configurar Cooldown')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏱️'),
                new ButtonBuilder()
                    .setCustomId('reset_config')
                    .setLabel('Resetar Config')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔄')
            );
    }
    
    static createSuggestionModal() {
        const modal = new ModalBuilder()
            .setCustomId('suggestion_modal')
            .setTitle('📝 Enviar Sugestão');
        
        const titleInput = new TextInputBuilder()
            .setCustomId('suggestion_title')
            .setLabel('Título da Sugestão')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Adicionar canal de música')
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(100);
        
        const descriptionInput = new TextInputBuilder()
            .setCustomId('suggestion_description')
            .setLabel('Descreva sua sugestão em detalhes')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explique sua sugestão, por que seria útil, como implementar, etc...')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000);
        
        const anonymousInput = new TextInputBuilder()
            .setCustomId('suggestion_anonymous')
            .setLabel('Enviar anonimamente? (sim/não)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Digite "sim" ou "não"')
            .setRequired(false)
            .setValue('não')
            .setMinLength(2)
            .setMaxLength(3);
        
        const firstRow = new ActionRowBuilder().addComponents(titleInput);
        const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
        const thirdRow = new ActionRowBuilder().addComponents(anonymousInput);
        
        modal.addComponents(firstRow, secondRow, thirdRow);
        return modal;
    }
}

// ============================================
// COMANDOS SLASH
// ============================================

const slashCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('suggestions')
            .setDescription('Configura o canal onde os usuários podem enviar sugestões')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para envio de sugestões')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            ),
        async execute(interaction) {
            const { member, guild, options } = interaction;
            const channel = options.getChannel('canal');
            
            if (!PermissionManager.canManageSuggestions(member, configManager.getConfig(guild.id))) {
                return interaction.reply({ 
                    content: '❌ Você não tem permissão para usar este comando!', 
                    ephemeral: true 
                });
            }
            
            const config = configManager.updateConfig(guild.id, { 
                suggestionsChannel: channel.id 
            });
            
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('✅ Canal de Sugestões Configurado!')
                .setDescription(`Os usuários agora podem enviar sugestões em ${channel}`)
                .addFields(
                    { name: '📝 Como funciona?', value: [
                        '1. Os usuários clicam no botão abaixo',
                        '2. Preenchem o formulário com sua sugestão',
                        '3. A sugestão é enviada para moderação',
                        '4. Após aprovada, vai para o canal de saída'
                    ].join('\n') }
                )
                .setTimestamp();
            
            const button = ComponentBuilder.createSuggestionButton();
            
            await interaction.reply({ embeds: [embed] });
            await channel.send({ 
                embeds: [EmbedBuilder.welcomeEmbed(guild)],
                components: [button] 
            });
            
            Logger.command(interaction.user.tag, '/suggestions', channel.name);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('suggestionschannel')
            .setDescription('Configura o canal onde as sugestões serão postadas')
            .addChannelOption(option =>
                option.setName('canal')
                    .setDescription('Canal para postagem das sugestões')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            ),
        async execute(interaction) {
            const { member, guild, options } = interaction;
            const channel = options.getChannel('canal');
            
            if (!PermissionManager.canManageSuggestions(member, configManager.getConfig(guild.id))) {
                return interaction.reply({ 
                    content: '❌ Você não tem permissão para usar este comando!', 
                    ephemeral: true 
                });
            }
            
            const config = configManager.updateConfig(guild.id, { 
                outputChannel: channel.id 
            });
            
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('✅ Canal de Saída Configurado!')
                .setDescription(`As sugestões aprovadas serão postadas em ${channel}`)
                .addFields(
                    { name: '📊 Sistema de Votação', value: [
                        '• Os membros poderão votar usando 👍 e 👎',
                        '• O bot adicionará reações automaticamente',
                        '• Votos são registrados e contabilizados'
                    ].join('\n') }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            Logger.command(interaction.user.tag, '/suggestionschannel', channel.name);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('suggest')
            .setDescription('Envia uma nova sugestão para o servidor'),
        async execute(interaction) {
            const config = configManager.getConfig(interaction.guild.id);
            
            if (!config.suggestionsChannel) {
                return interaction.reply({ 
                    content: '❌ O sistema de sugestões não está configurado neste servidor!', 
                    ephemeral: true 
                });
            }
            
            const modal = ComponentBuilder.createSuggestionModal();
            await interaction.showModal(modal);
            
            Logger.command(interaction.user.tag, '/suggest');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('config')
            .setDescription('Mostra as configurações atuais do sistema de sugestões'),
        async execute(interaction) {
            const config = configManager.getConfig(interaction.guild.id);
            const embed = EmbedBuilder.configEmbed(config, interaction.guild);
            
            await interaction.reply({ embeds: [embed] });
            Logger.command(interaction.user.tag, '/config');
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Mostra todos os comandos disponíveis'),
        async execute(interaction) {
            const embed = EmbedBuilder.helpEmbed(PREFIX);
            await interaction.reply({ embeds: [embed] });
            Logger.command(interaction.user.tag, '/help');
        }
    }
];

// ============================================
// COMANDOS DE PREFIXO
// ============================================

const prefixCommands = {
    ping: {
        name: 'ping',
        description: 'Mostra a latência do bot',
        execute: async (message, args) => {
            const sent = await message.reply('🏓 Pong!');
            const latency = sent.createdTimestamp - message.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🏓 Pong!')
                .addFields(
                    { name: '📡 Latência do Bot', value: `${latency}ms`, inline: true },
                    { name: '🌐 Latência da API', value: `${apiLatency}ms`, inline: true },
                    { name: '⏱️ Uptime', value: Utils.formatDuration(client.uptime), inline: true }
                )
                .setTimestamp();
            
            await sent.edit({ content: null, embeds: [embed] });
        }
    },
    uptime: {
        name: 'uptime',
        description: 'Mostra há quanto tempo o bot está online',
        execute: async (message, args) => {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('⏱️ Uptime do Bot')
                .setDescription(`O bot está online há ${Utils.formatDuration(client.uptime)}`)
                .addFields(
                    { name: '📅 Iniciado em', value: new Date(Date.now() - client.uptime).toLocaleString(), inline: true },
                    { name: '🏠 Servidores', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Usuários', value: `${client.users.cache.size}`, inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    },
    stats: {
        name: 'stats',
        description: 'Mostra estatísticas do bot',
        execute: async (message, args) => {
            let totalMembers = 0;
            client.guilds.cache.forEach(guild => totalMembers += guild.memberCount);
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📊 Estatísticas do Bot')
                .addFields(
                    { name: '🏠 Servidores', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Usuários Totais', value: `${totalMembers}`, inline: true },
                    { name: '💾 Memória Usada', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                    { name: '📝 Comandos Prefixo', value: `${client.prefixCommands.size}`, inline: true },
                    { name: '🔷 Comandos Slash', value: `${client.slashCommands.size}`, inline: true },
                    { name: '⚙️ Node.js', value: process.version, inline: true },
                    { name: '📚 Discord.js', value: `v${require('discord.js').version}`, inline: true },
                    { name: '🕒 Último Reinício', value: new Date(Date.now() - client.uptime).toLocaleString(), inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    },
    config: {
        name: 'config',
        description: 'Mostra as configurações do servidor',
        execute: async (message, args) => {
            const config = configManager.getConfig(message.guild.id);
            const embed = EmbedBuilder.configEmbed(config, message.guild);
            await message.reply({ embeds: [embed] });
        }
    },
    reset: {
        name: 'reset',
        description: 'Reseta as configurações do servidor',
        execute: async (message, args) => {
            if (!PermissionManager.canManageSuggestions(message.member, configManager.getConfig(message.guild.id))) {
                return message.reply('❌ Você não tem permissão para usar este comando!');
            }
            
            configManager.resetConfig(message.guild.id);
            await message.reply('✅ Configurações resetadas para o padrão!');
        }
    },
    info: {
        name: 'info',
        description: 'Informações sobre o bot',
        execute: async (message, args) => {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 Informações do Bot')
                .setDescription('Bot de Sugestões para Discord - Sistema completo de gerenciamento de sugestões')
                .addFields(
                    { name: '👨‍💻 Desenvolvedor', value: `<@${OWNER_ID}>`, inline: true },
                    { name: '📝 Versão', value: '2.0.0', inline: true },
                    { name: '📚 Biblioteca', value: 'Discord.js v14', inline: true },
                    { name: '🔗 GitHub', value: '[Repositório](https://github.com)', inline: true },
                    { name: '💡 Prefixo', value: PREFIX, inline: true },
                    { name: '⚡ Slash Commands', value: 'Suportado', inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    },
    suggest: {
        name: 'suggest',
        description: 'Envia uma sugestão rapidamente',
        execute: async (message, args) => {
            const config = configManager.getConfig(message.guild.id);
            
            if (!config.suggestionsChannel) {
                return message.reply('❌ O sistema de sugestões não está configurado!');
            }
            
            const suggestionText = args.join(' ');
            if (!suggestionText) {
                return message.reply('❌ Você precisa fornecer o texto da sugestão! Exemplo: `!suggest Adicionar canal de música`');
            }
            
            if (suggestionText.length < config.minLength) {
                return message.reply(`❌ A sugestão deve ter pelo menos ${config.minLength} caracteres!`);
            }
            
            if (suggestionText.length > config.maxLength) {
                return message.reply(`❌ A sugestão deve ter no máximo ${config.maxLength} caracteres!`);
            }
            
            // Verificar cooldown
            const userId = message.author.id;
            const lastSuggestion = client.userSuggestions.get(userId);
            if (lastSuggestion && Date.now() - lastSuggestion < config.cooldown) {
                const remaining = Utils.formatDuration(config.cooldown - (Date.now() - lastSuggestion));
                return message.reply(`⏱️ Aguarde ${remaining} antes de enviar outra sugestão!`);
            }
            
            // Processar sugestão
            const suggestionId = client.suggestionsCount.get(message.guild.id) || 0;
            const suggestion = {
                id: suggestionId + 1,
                content: suggestionText,
                anonymous: false,
                timestamp: Date.now(),
                author: message.author.id
            };
            
            // Enviar para o canal de saída
            const outputChannel = message.guild.channels.cache.get(config.outputChannel);
            if (outputChannel) {
                const embed = EmbedBuilder.suggestionEmbed(suggestion, config, message.author);
                const buttons = ComponentBuilder.createVoteButtons();
                
                const msg = await outputChannel.send({ embeds: [embed], components: [buttons] });
                await msg.react('👍');
                await msg.react('👎');
                
                // Atualizar contador
                client.suggestionsCount.set(message.guild.id, suggestion.id);
                client.userSuggestions.set(userId, Date.now());
                
                await message.reply(`✅ Sugestão #${suggestion.id} enviada com sucesso!`);
            } else {
                await message.reply('❌ Canal de saída não configurado!');
            }
        }
    },
    invite: {
        name: 'invite',
        description: 'Gera um link de convite para o bot',
        execute: async (message, args) => {
            const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🔗 Convite do Bot')
                .setDescription(`[Clique aqui para me adicionar ao seu servidor!](${inviteLink})`)
                .addFields(
                    { name: '📋 Permissões', value: 'Administrador (Recomendado)', inline: true },
                    { name: '🔷 Slash Commands', value: 'Incluído', inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    },
    serverinfo: {
        name: 'serverinfo',
        description: 'Mostra informações do servidor',
        execute: async (message, args) => {
            const { guild } = message;
            
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📊 Informações de ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '📅 Criado em', value: guild.createdAt.toLocaleDateString(), inline: true },
                    { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
                    { name: '💬 Canais', value: `${guild.channels.cache.size}`, inline: true },
                    { name: '🎭 Cargos', value: `${guild.roles.cache.size}`, inline: true },
                    { name: '😊 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                    { name: '🚀 Impulsos', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
                    { name: '⭐ Nível de Impulso', value: `${guild.premiumTier}`, inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    },
    userinfo: {
        name: 'userinfo',
        description: 'Mostra informações de um usuário',
        execute: async (message, args) => {
            const user = message.mentions.users.first() || message.author;
            const member = message.guild.members.cache.get(user.id);
            
            const embed = new EmbedBuilder()
                .setColor(member?.displayColor || '#5865F2')
                .setTitle(`👤 Informações de ${user.tag}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '📅 Conta criada em', value: user.createdAt.toLocaleDateString(), inline: true },
                    { name: '📥 Entrou em', value: member?.joinedAt?.toLocaleDateString() || 'N/A', inline: true },
                    { name: '🎭 Cargos', value: `${member?.roles.cache.size || 0}`, inline: true },
                    { name: '👑 Cargo mais alto', value: member?.roles.highest?.toString() || 'Nenhum', inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [embed] });
        }
    }
};

// Comandos do Owner
const ownerCommands = {
    eval: {
        name: 'eval',
        description: 'Executa código JavaScript (Owner apenas)',
        execute: async (message, args) => {
            if (!PermissionManager.isOwner(message.author.id)) return;
            
            try {
                const code = args.join(' ');
                let evaled = eval(code);
                
                if (typeof evaled !== 'string') {
                    evaled = require('util').inspect(evaled);
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Eval Executado')
                    .setDescription(`\`\`\`js\n${Utils.truncate(evaled, 1990)}\n\`\`\``)
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Erro no Eval')
                    .setDescription(`\`\`\`\n${error}\n\`\`\``)
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            }
        }
    },
    reload: {
        name: 'reload',
        description: 'Recarrega os comandos do bot (Owner apenas)',
        execute: async (message, args) => {
            if (!PermissionManager.isOwner(message.author.id)) return;
            
            await message.reply('🔄 Recarregando comandos...');
            
            try {
                // Recarregar comandos slash
                const rest = new REST({ version: '10' }).setToken(TOKEN);
                await rest.put(Routes.applicationCommands(CLIENT_ID || client.user.id), { 
                    body: slashCommands.map(cmd => cmd.data.toJSON()) 
                });
                
                Logger.success('Comandos slash recarregados!');
                await message.reply('✅ Comandos recarregados com sucesso!');
            } catch (error) {
                Logger.error(`Erro ao recarregar comandos: ${error.message}`);
                await message.reply(`❌ Erro ao recarregar comandos: ${error.message}`);
            }
        }
    },
    shutdown: {
        name: 'shutdown',
        description: 'Desliga o bot (Owner apenas)',
        execute: async (message, args) => {
            if (!PermissionManager.isOwner(message.author.id)) return;
            
            await message.reply('👋 Desligando o bot...');
            Logger.warn(`Bot desligado por ${message.author.tag}`);
            
            configManager.saveConfig();
            await Utils.sleep(1000);
            process.exit(0);
        }
    },
    servers: {
        name: 'servers',
        description: 'Lista todos os servidores (Owner apenas)',
        execute: async (message, args) => {
            if (!PermissionManager.isOwner(message.author.id)) return;
            
            const guilds = client.guilds.cache.map(g => `${g.name} (${g.id}) - ${g.memberCount} membros`);
            const chunks = Utils.chunkArray(guilds, 10);
            
            for (const chunk of chunks) {
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`📋 Servidores (${client.guilds.cache.size})`)
                    .setDescription(chunk.join('\n'))
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            }
        }
    },
    announce: {
        name: 'announce',
        description: 'Envia anúncio para todos os servidores (Owner apenas)',
        execute: async (message, args) => {
            if (!PermissionManager.isOwner(message.author.id)) return;
            
            const announcement = args.join(' ');
            if (!announcement) {
                return message.reply('❌ Forneça o texto do anúncio!');
            }
            
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📢 Anúncio do Desenvolvedor')
                .setDescription(announcement)
                .setTimestamp()
                .setFooter({ text: 'Anúncio oficial' });
            
            let count = 0;
            for (const guild of client.guilds.cache.values()) {
                const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText);
                if (channel) {
                    try {
                        await channel.send({ embeds: [embed] });
                        count++;
                    } catch (error) {
                        Logger.error(`Erro ao enviar anúncio para ${guild.name}: ${error.message}`);
                    }
                }
            }
            
            await message.reply(`✅ Anúncio enviado para ${count} servidores!`);
        }
    }
};

// ============================================
// EVENT HANDLERS
// ============================================

client.once(Events.ClientReady, async () => {
    Logger.success(`Bot conectado como ${client.user.tag}!`);
    Logger.info(`ID do Bot: ${client.user.id}`);
    Logger.info(`Servidores: ${client.guilds.cache.size}`);
    Logger.info(`Usuários: ${client.users.cache.size}`);
    
    // Registrar comandos slash
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    
    try {
        Logger.info('🔄 Registrando comandos slash...');
        
        if (CLIENT_ID) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { 
                body: slashCommands.map(cmd => cmd.data.toJSON()) 
            });
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { 
                body: slashCommands.map(cmd => cmd.data.toJSON()) 
            });
        }
        
        Logger.success('✅ Comandos slash registrados com sucesso!');
    } catch (error) {
        Logger.error(`❌ Erro ao registrar comandos slash: ${error.message}`);
    }
    
    // Listar comandos de prefixo no console
    console.log('\n' + '='.repeat(50));
    console.log('\x1b[36m%s\x1b[0m', '📋 COMANDOS DE PREFIXO DISPONÍVEIS (!):');
    console.log('='.repeat(50));
    
    for (const [name, cmd] of Object.entries(prefixCommands)) {
        console.log(`\x1b[33m!${name.padEnd(15)}\x1b[0m - \x1b[90m${cmd.description}\x1b[0m`);
    }
    
    console.log('\n\x1b[35m%s\x1b[0m', '👑 COMANDOS DO OWNER (!):');
    console.log('='.repeat(50));
    
    for (const [name, cmd] of Object.entries(ownerCommands)) {
        console.log(`\x1b[31m!${name.padEnd(15)}\x1b[0m - \x1b[90m${cmd.description}\x1b[0m`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\x1b[32m%s\x1b[0m', '✅ Bot pronto para uso!');
    console.log('='.repeat(50) + '\n');
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = slashCommands.find(cmd => cmd.data.name === interaction.commandName);
            
            if (!command) {
                Logger.warn(`Comando não encontrado: ${interaction.commandName}`);
                return;
            }
            
            await command.execute(interaction);
        }
        
        if (interaction.isButton()) {
            const { customId } = interaction;
            
            if (customId === 'create_suggestion') {
                const config = configManager.getConfig(interaction.guild.id);
                
                if (!config.suggestionsChannel) {
                    return interaction.reply({ 
                        content: '❌ O sistema de sugestões não está configurado!', 
                        ephemeral: true 
                    });
                }
                
                const modal = ComponentBuilder.createSuggestionModal();
                await interaction.showModal(modal);
            }
            
            if (customId === 'vote_up' || customId === 'vote_down') {
                const config = configManager.getConfig(interaction.guild.id);
                const userId = interaction.user.id;
                
                // Verificar se já votou
                const voteKey = `${interaction.message.id}_${userId}`;
                if (client.activeButtons.has(voteKey)) {
                    return interaction.reply({ 
                        content: '❌ Você já votou nesta sugestão!', 
                        ephemeral: true 
                    });
                }
                
                // Registrar voto
                client.activeButtons.set(voteKey, true);
                
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                const fields = embed.data.fields;
                
                if (fields) {
                    const voteField = fields.find(f => f.name.includes(customId === 'vote_up' ? '👍' : '👎'));
                    if (voteField) {
                        const currentVotes = parseInt(voteField.value) || 0;
                        voteField.value = (currentVotes + 1).toString();
                    }
                }
                
                await interaction.message.edit({ embeds: [embed] });
                await interaction.reply({ 
                    content: `✅ Seu voto foi registrado!`, 
                    ephemeral: true 
                });
                
                // Limpar após 1 hora
                setTimeout(() => client.activeButtons.delete(voteKey), 3600000);
            }
            
            if (customId === 'suggestion_info') {
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('ℹ️ Informações da Sugestão')
                    .setDescription([
                        '**Como funciona o sistema de sugestões:**',
                        '• Vote 👍 se você gostou da sugestão',
                        '• Vote 👎 se você não concorda',
                        '• Cada usuário pode votar apenas uma vez',
                        '• Sugestões com mais votos têm mais chances de serem implementadas'
                    ].join('\n'))
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            if (customId === 'report_suggestion') {
                await interaction.reply({ 
                    content: '🚩 Sugestão reportada para a moderação. Obrigado!', 
                    ephemeral: true 
                });
                
                // Notificar moderadores
                const config = configManager.getConfig(interaction.guild.id);
                if (config.notifications.onSuggestion) {
                    const modChannel = interaction.guild.channels.cache.get(config.suggestionsChannel);
                    if (modChannel) {
                        await modChannel.send(`🚩 Sugestão reportada por ${interaction.user.tag} em ${interaction.message.url}`);
                    }
                }
            }
            
            if (customId === 'toggle_anonymous') {
                if (!PermissionManager.canManageSuggestions(interaction.member, configManager.getConfig(interaction.guild.id))) {
                    return interaction.reply({ content: '❌ Sem permissão!', ephemeral: true });
                }
                
                const config = configManager.getConfig(interaction.guild.id);
                config.allowAnonymous = !config.allowAnonymous;
                configManager.updateConfig(interaction.guild.id, config);
                
                await interaction.reply({ 
                    content: `✅ Sugestões anônimas agora estão ${config.allowAnonymous ? 'ativadas' : 'desativadas'}!`, 
                    ephemeral: true 
                });
            }
        }
        
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'suggestion_modal') {
                const title = interaction.fields.getTextInputValue('suggestion_title');
                const description = interaction.fields.getTextInputValue('suggestion_description');
                const anonymousInput = interaction.fields.getTextInputValue('suggestion_anonymous');
                
                const config = configManager.getConfig(interaction.guild.id);
                const isAnonymous = anonymousInput.toLowerCase() === 'sim';
                
                // Validações
                if (description.length < config.minLength) {
                    return interaction.reply({ 
                        content: `❌ A sugestão deve ter pelo menos ${config.minLength} caracteres!`, 
                        ephemeral: true 
                    });
                }
                
                if (description.length > config.maxLength) {
                    return interaction.reply({ 
                        content: `❌ A sugestão deve ter no máximo ${config.maxLength} caracteres!`, 
                        ephemeral: true 
                    });
                }
                
                // Verificar cooldown
                const userId = interaction.user.id;
                const lastSuggestion = client.userSuggestions.get(userId);
                if (lastSuggestion && Date.now() - lastSuggestion < config.cooldown) {
                    const remaining = Utils.formatDuration(config.cooldown - (Date.now() - lastSuggestion));
                    return interaction.reply({ 
                        content: `⏱️ Aguarde ${remaining} antes de enviar outra sugestão!`, 
                        ephemeral: true 
                    });
                }
                
                // Criar sugestão
                const suggestionId = (client.suggestionsCount.get(interaction.guild.id) || 0) + 1;
                const suggestion = {
                    id: suggestionId,
                    title: title,
                    content: description,
                    anonymous: isAnonymous && config.allowAnonymous,
                    timestamp: Date.now(),
                    author: interaction.user.id,
                    status: 'pending'
                };
                
                // Enviar para o canal de saída
                const outputChannel = interaction.guild.channels.cache.get(config.outputChannel);
                if (outputChannel) {
                    const embed = EmbedBuilder.suggestionEmbed(suggestion, config, interaction.user);
                    const buttons = ComponentBuilder.createVoteButtons();
                    
                    const msg = await outputChannel.send({ embeds: [embed], components: [buttons] });
                    await msg.react('👍');
                    await msg.react('👎');
                    
                    // Atualizar contadores
                    client.suggestionsCount.set(interaction.guild.id, suggestionId);
                    client.userSuggestions.set(userId, Date.now());
                    
                    await interaction.reply({ 
                        content: `✅ Sugestão #${suggestionId} enviada com sucesso!`, 
                        ephemeral: true 
                    });
                    
                    Logger.success(`Nova sugestão #${suggestionId} de ${interaction.user.tag} em ${interaction.guild.name}`);
                } else {
                    await interaction.reply({ 
                        content: '❌ Canal de saída não configurado! Contate um administrador.', 
                        ephemeral: true 
                    });
                }
            }
        }
    } catch (error) {
        Logger.error(`Erro na interação: ${error.message}`);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ Ocorreu um erro ao processar sua solicitação!', 
                ephemeral: true 
            });
        }
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    
    // Verificar menção ao bot
    if (message.content === `<@${client.user.id}>` || message.content === `<@!${client.user.id}>`) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('👋 Olá! Eu sou o Bot de Sugestões')
            .setDescription([
                `Meu prefixo neste servidor é \`${PREFIX}\``,
                '',
                '**Comandos úteis:**',
                `\`${PREFIX}help\` - Mostra todos os comandos`,
                `\`${PREFIX}suggest\` - Envia uma sugestão`,
                `\`${PREFIX}config\` - Mostra configurações`,
                '',
                '**Slash Commands:**',
                '`/help` - Menu de ajuda interativo',
                '`/suggest` - Enviar sugestão via modal'
            ].join('\n'))
            .setTimestamp();
        
        return message.reply({ embeds: [embed] });
    }
    
    // Comandos de prefixo
    if (!message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    // Verificar comandos normais
    if (prefixCommands[commandName]) {
        Logger.command(message.author.tag, PREFIX + commandName, args.join(' '));
        
        try {
            await prefixCommands[commandName].execute(message, args);
        } catch (error) {
            Logger.error(`Erro no comando ${commandName}: ${error.message}`);
            await message.reply('❌ Ocorreu um erro ao executar este comando!');
        }
        return;
    }
    
    // Verificar comandos do owner
    if (ownerCommands[commandName]) {
        if (!PermissionManager.isOwner(message.author.id)) {
            return message.reply('❌ Este comando é restrito ao desenvolvedor do bot!');
        }
        
        Logger.command(message.author.tag, PREFIX + commandName + ' (OWNER)', args.join(' '));
        
        try {
            await ownerCommands[commandName].execute(message, args);
        } catch (error) {
            Logger.error(`Erro no comando owner ${commandName}: ${error.message}`);
            await message.reply('❌ Ocorreu um erro ao executar este comando!');
        }
        return;
    }
});

client.on(Events.GuildCreate, async guild => {
    Logger.success(`Bot adicionado ao servidor: ${guild.name} (${guild.id})`);
    
    // Enviar mensagem de boas-vindas
    const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText);
    if (channel) {
        const embed = EmbedBuilder.welcomeEmbed(guild);
        await channel.send({ embeds: [embed] });
    }
});

client.on(Events.GuildDelete, async guild => {
    Logger.warn(`Bot removido do servidor: ${guild.name} (${guild.id})`);
    
    // Limpar configurações
    client.suggestionsConfig.delete(guild.id);
    client.suggestionsCount.delete(guild.id);
    configManager.saveConfig();
});

client.on(Events.Error, error => {
    Logger.error(`Erro no cliente Discord: ${error.message}`);
});

client.on(Events.Warn, warning => {
    Logger.warn(`Aviso do Discord: ${warning}`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', error => {
    Logger.error(`Erro não tratado (Promise): ${error.message}`);
    if (error.stack) Logger.debug(error.stack);
});

process.on('uncaughtException', error => {
    Logger.error(`Erro não capturado: ${error.message}`);
    if (error.stack) Logger.debug(error.stack);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    Logger.warn('Recebido sinal SIGINT. Fechando conexões...');
    configManager.saveConfig();
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    Logger.warn('Recebido sinal SIGTERM. Fechando conexões...');
    configManager.saveConfig();
    await client.destroy();
    process.exit(0);
});

// ============================================
// INICIALIZAÇÃO DO BOT
// ============================================

// Inicializar collections
for (const [name, cmd] of Object.entries(prefixCommands)) {
    client.prefixCommands.set(name, cmd);
}

for (const cmd of slashCommands) {
    client.slashCommands.set(cmd.data.name, cmd);
}

Logger.info('='.repeat(50));
Logger.info('🤖 Iniciando Bot de Sugestões...');
Logger.info(`📝 Prefixo configurado: ${PREFIX}`);
Logger.info(`👑 Owner ID: ${OWNER_ID}`);
Logger.info('='.repeat(50));

// Conectar ao Discord
client.login(TOKEN).catch(error => {
    Logger.error(`Falha ao conectar ao Discord: ${error.message}`);
    Logger.error('Verifique se o TOKEN no arquivo .env está correto!');
    process.exit(1);
});

// Exportar para uso em outros arquivos (se necessário)
module.exports = {
    client,
    configManager,
    Logger,
    Utils,
    PermissionManager,
    EmbedBuilder,
    ComponentBuilder
};