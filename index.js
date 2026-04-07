// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, REST, Routes } = require('discord.js');

// Configuração do cliente com opções de reconexão
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    // Configurações de reconexão
    rest: {
        timeout: 15000,
        retries: 3
    }
});

// Variáveis de ambiente
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

// Verificar se as variáveis estão configuradas
if (!TOKEN) {
    console.error('❌ TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('❌ OWNER_ID não encontrado no arquivo .env');
    process.exit(1);
}

// Banco de dados em memória
class Database {
    constructor() {
        this.suggestionsChannel = new Map();
        this.suggestions = new Map();
        this.suggestionCounter = new Map();
        this.userSuggestions = new Map();
        this.suggestionVotes = new Map();
        this.suggestionHistory = new Map();
        this.moderationLogs = new Map();
        this.bannedUsers = new Map();
        this.cooldown = new Map();
        this.userReputation = new Map();
        this.suggestionComments = new Map();
        this.suggestionMessageIds = new Map();
    }

    setSuggestionsChannel(guildId, channelId) {
        this.suggestionsChannel.set(guildId, channelId);
        return true;
    }

    getSuggestionsChannel(guildId) {
        return this.suggestionsChannel.get(guildId);
    }

    createSuggestion(guildId, userId, content, category = 'geral') {
        const suggestionId = this.generateSuggestionId(guildId);
        const suggestionData = {
            id: suggestionId,
            guildId,
            userId,
            content,
            category,
            createdAt: new Date(),
            status: 'pendente',
            votesUp: 0,
            votesDown: 0,
            totalVotes: 0,
            implementedAt: null,
            rejectedAt: null,
            implementedBy: null,
            rejectedBy: null,
            rejectionReason: null
        };

        this.suggestions.set(suggestionId, suggestionData);
        
        if (!this.userSuggestions.has(userId)) {
            this.userSuggestions.set(userId, []);
        }
        this.userSuggestions.get(userId).push(suggestionId);

        if (!this.suggestionVotes.has(suggestionId)) {
            this.suggestionVotes.set(suggestionId, new Map());
        }

        return suggestionData;
    }

    generateSuggestionId(guildId) {
        const current = this.suggestionCounter.get(guildId) || 0;
        const newId = current + 1;
        this.suggestionCounter.set(guildId, newId);
        return `${guildId}_${newId}`;
    }

    getSuggestion(suggestionId) {
        return this.suggestions.get(suggestionId);
    }

    getAllSuggestions(guildId) {
        const suggestions = [];
        for (const [id, data] of this.suggestions) {
            if (data.guildId === guildId) {
                suggestions.push(data);
            }
        }
        return suggestions.sort((a, b) => b.createdAt - a.createdAt);
    }

    getUserSuggestions(userId) {
        const suggestionIds = this.userSuggestions.get(userId) || [];
        return suggestionIds.map(id => this.suggestions.get(id)).filter(s => s);
    }

    voteOnSuggestion(suggestionId, userId, voteType) {
        const suggestion = this.suggestions.get(suggestionId);
        if (!suggestion) return null;

        const votes = this.suggestionVotes.get(suggestionId);
        const previousVote = votes.get(userId);

        if (previousVote === voteType) {
            votes.delete(userId);
            if (voteType === 'up') suggestion.votesUp--;
            else suggestion.votesDown--;
        } else {
            if (previousVote) {
                if (previousVote === 'up') suggestion.votesUp--;
                else suggestion.votesDown--;
            }
            votes.set(userId, voteType);
            if (voteType === 'up') suggestion.votesUp++;
            else suggestion.votesDown++;
        }

        suggestion.totalVotes = suggestion.votesUp + suggestion.votesDown;
        return { suggestion, newVote: !previousVote || previousVote !== voteType };
    }

    getUserVote(suggestionId, userId) {
        const votes = this.suggestionVotes.get(suggestionId);
        return votes ? votes.get(userId) : null;
    }

    updateSuggestionStatus(suggestionId, status, moderatorId, reason = null) {
        const suggestion = this.suggestions.get(suggestionId);
        if (!suggestion) return false;

        suggestion.status = status;
        
        if (status === 'implementado') {
            suggestion.implementedAt = new Date();
            suggestion.implementedBy = moderatorId;
        } else if (status === 'rejeitado') {
            suggestion.rejectedAt = new Date();
            suggestion.rejectedBy = moderatorId;
            suggestion.rejectionReason = reason;
        }

        if (!this.suggestionHistory.has(suggestionId)) {
            this.suggestionHistory.set(suggestionId, []);
        }
        
        this.suggestionHistory.get(suggestionId).push({
            status,
            moderatorId,
            reason,
            timestamp: new Date()
        });

        return true;
    }

    addComment(suggestionId, userId, comment) {
        if (!this.suggestionComments.has(suggestionId)) {
            this.suggestionComments.set(suggestionId, []);
        }
        
        const commentData = {
            id: Date.now(),
            userId,
            comment,
            createdAt: new Date(),
            likes: 0,
            likedBy: []
        };
        
        this.suggestionComments.get(suggestionId).push(commentData);
        return commentData;
    }

    getComments(suggestionId) {
        return this.suggestionComments.get(suggestionId) || [];
    }

    addToCooldown(userId) {
        this.cooldown.set(userId, Date.now());
    }

    isOnCooldown(userId, cooldownSeconds = 30) {
        const lastTime = this.cooldown.get(userId);
        if (!lastTime) return false;
        return (Date.now() - lastTime) < (cooldownSeconds * 1000);
    }

    getCooldownRemaining(userId, cooldownSeconds = 30) {
        const lastTime = this.cooldown.get(userId);
        if (!lastTime) return 0;
        const elapsed = (Date.now() - lastTime) / 1000;
        return Math.max(0, cooldownSeconds - elapsed);
    }

    updateUserReputation(userId, change) {
        const current = this.userReputation.get(userId) || 0;
        const newRep = Math.max(0, current + change);
        this.userReputation.set(userId, newRep);
        return newRep;
    }

    getUserReputation(userId) {
        return this.userReputation.get(userId) || 0;
    }

    addModerationLog(guildId, action, moderatorId, targetId, reason) {
        if (!this.moderationLogs.has(guildId)) {
            this.moderationLogs.set(guildId, []);
        }
        
        const log = {
            action,
            moderatorId,
            targetId,
            reason,
            timestamp: new Date()
        };
        
        this.moderationLogs.get(guildId).push(log);
        return log;
    }

    getModerationLogs(guildId, limit = 50) {
        const logs = this.moderationLogs.get(guildId) || [];
        return logs.slice(-limit);
    }

    banUser(userId, reason, guildId, moderatorId) {
        this.bannedUsers.set(userId, { reason, date: new Date(), guildId, moderatorId });
        this.addModerationLog(guildId, 'ban', moderatorId, userId, reason);
        return true;
    }

    isUserBanned(userId, guildId) {
        const ban = this.bannedUsers.get(userId);
        return ban && ban.guildId === guildId;
    }

    unbanUser(userId) {
        return this.bannedUsers.delete(userId);
    }
}

const db = new Database();

function isOwner(userId) {
    return userId === OWNER_ID;
}

function createSuggestionEmbed(suggestion, user) {
    const statusEmojis = {
        'pendente': '⏳',
        'aprovado': '✅',
        'rejeitado': '❌',
        'implementado': '🎉',
        'em-analise': '🔍'
    };
    
    const statusTexts = {
        'pendente': 'Pendente',
        'aprovado': 'Aprovado',
        'rejeitado': 'Rejeitado',
        'implementado': 'Implementado',
        'em-analise': 'Em Análise'
    };
    
    const embed = new EmbedBuilder()
        .setTitle(`💡 Sugestão #${suggestion.id.split('_')[1]}`)
        .setDescription(suggestion.content)
        .setColor(suggestion.status === 'pendente' ? 0xFFA500 :
                 suggestion.status === 'aprovado' ? 0x00FF00 :
                 suggestion.status === 'rejeitado' ? 0xFF0000 :
                 suggestion.status === 'implementado' ? 0x9B59B6 : 0x3498DB)
        .addFields(
            { name: '👤 Autor', value: `<@${suggestion.userId}>`, inline: true },
            { name: '📂 Categoria', value: suggestion.category, inline: true },
            { name: '📅 Data', value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:R>`, inline: true },
            { name: '👍 Votos', value: `${suggestion.votesUp}`, inline: true },
            { name: '👎 Votos', value: `${suggestion.votesDown}`, inline: true },
            { name: '📊 Status', value: `${statusEmojis[suggestion.status]} ${statusTexts[suggestion.status]}`, inline: true }
        )
        .setFooter({ text: `ID: ${suggestion.id}`, iconURL: user?.displayAvatarURL() })
        .setTimestamp();
    
    if (suggestion.rejectionReason) {
        embed.addFields({ name: '❌ Motivo', value: suggestion.rejectionReason, inline: false });
    }
    
    return embed;
}

function createSuggestionsChannelEmbed() {
    return new EmbedBuilder()
        .setTitle('📝 Sistema de Sugestões')
        .setDescription('Bem-vindo ao canal de sugestões! Compartilhe suas ideias para melhorar o servidor.')
        .setColor(0x5865F2)
        .addFields(
            { name: '📌 Como funciona', value: 'Clique no botão abaixo para enviar sua sugestão.', inline: false },
            { name: '✅ Regras', value: '• Seja claro e específico\n• Explique o motivo\n• Evite sugestões duplicadas\n• Seja respeitoso', inline: false },
            { name: '🎯 Status', value: '• ⏳ Pendente\n• ✅ Aprovado\n• ❌ Rejeitado\n• 🎉 Implementado', inline: false }
        )
        .setFooter({ text: 'Clique no botão para enviar sua sugestão' })
        .setTimestamp();
}

function createStatsEmbed(guildId) {
    const suggestions = db.getAllSuggestions(guildId);
    const total = suggestions.length;
    const pending = suggestions.filter(s => s.status === 'pendente').length;
    const approved = suggestions.filter(s => s.status === 'aprovado').length;
    const rejected = suggestions.filter(s => s.status === 'rejeitado').length;
    const implemented = suggestions.filter(s => s.status === 'implementado').length;
    
    return new EmbedBuilder()
        .setTitle('📊 Estatísticas')
        .setColor(0x5865F2)
        .addFields(
            { name: '📝 Total', value: `${total}`, inline: true },
            { name: '⏳ Pendentes', value: `${pending}`, inline: true },
            { name: '✅ Aprovadas', value: `${approved}`, inline: true },
            { name: '❌ Rejeitadas', value: `${rejected}`, inline: true },
            { name: '🎉 Implementadas', value: `${implemented}`, inline: true }
        )
        .setTimestamp();
}

function createSuggestionModal() {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('suggestion_modal')
        .setTitle('Enviar Sugestão');
    
    const titleInput = new TextInputBuilder()
        .setCustomId('suggestion_title')
        .setLabel('Título')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Adicionar canal de música')
        .setRequired(true)
        .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
        .setCustomId('suggestion_description')
        .setLabel('Descrição')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explique sua sugestão em detalhes...')
        .setRequired(true)
        .setMaxLength(2000);
    
    const categoryInput = new TextInputBuilder()
        .setCustomId('suggestion_category')
        .setLabel('Categoria')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Moderação, Diversão')
        .setRequired(true)
        .setMaxLength(50);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(categoryInput)
    );
    
    return modal;
}

// Comandos
const commands = [
    {
        name: 'suggestions',
        description: 'Configura o canal de sugestões',
        options: [
            {
                name: 'channel',
                description: 'O canal de sugestões',
                type: 7,
                required: true
            }
        ]
    },
    {
        name: 'suggestionschannel',
        description: 'Envia o embed de sugestões no canal',
        options: [
            {
                name: 'channel',
                description: 'O canal para enviar o embed',
                type: 7,
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Eventos de conexão com tratamento de erro
client.once('clientReady', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    console.log(`👑 Owner ID: ${OWNER_ID}`);
    
    try {
        console.log('🔄 Registrando comandos...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados!');
        console.log('📝 Comandos: /suggestions e /suggestionschannel');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
    
    client.user.setPresence({
        activities: [{ name: '𝙼𝚊𝚍𝚎 𝚋𝚢 𝚈𝟸𝚔_𝙽𝚊𝚝', type: 3 }],
        status: 'online'
    });
});

// Reconexão automática
client.on('shardDisconnect', (event, id) => {
    console.log(`⚠️ Shard ${id} desconectado. Tentando reconectar...`);
});

client.on('shardReconnecting', (id) => {
    console.log(`🔄 Shard ${id} reconectando...`);
});

client.on('shardResume', (id, replayedEvents) => {
    console.log(`✅ Shard ${id} reconectado! Eventos repetidos: ${replayedEvents}`);
});

// Tratamento de erros globais
client.on('error', (error) => {
    console.error('❌ Erro do cliente:', error);
});

client.on('warn', (warning) => {
    console.warn('⚠️ Aviso:', warning);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado (Promise):', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

// Handler de interações
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isButton()) {
            await handleButton(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        }
    } catch (error) {
        console.error('❌ Erro ao processar interação:', error);
        const errorMsg = { content: '❌ Ocorreu um erro ao processar sua ação.', ephemeral: true };
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(errorMsg).catch(() => {});
        }
    }
});

async function handleCommand(interaction) {
    const { commandName, user, guildId } = interaction;
    
    if (!guildId) {
        return interaction.reply({ content: '❌ Use em um servidor!', ephemeral: true });
    }
    
    if (!isOwner(user.id)) {
        return interaction.reply({
            content: '❌ Apenas o owner pode usar este comando.',
            ephemeral: true
        });
    }
    
    if (commandName === 'suggestions') {
        const channel = interaction.options.getChannel('channel');
        
        if (channel.type !== ChannelType.GuildText) {
            return interaction.reply({ content: '❌ Selecione um canal de texto!', ephemeral: true });
        }
        
        db.setSuggestionsChannel(interaction.guildId, channel.id);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Canal Configurado')
            .setDescription(`Canal: ${channel}`)
            .setColor(0x00FF00)
            .addFields({ name: 'Próximo passo', value: `Use /suggestionschannel ${channel}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (commandName === 'suggestionschannel') {
        const channel = interaction.options.getChannel('channel');
        const suggestionsChannelId = db.getSuggestionsChannel(interaction.guildId);
        
        if (!suggestionsChannelId) {
            return interaction.reply({
                content: '❌ Use /suggestions primeiro!',
                ephemeral: true
            });
        }
        
        const embed = createSuggestionsChannelEmbed();
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('send_suggestion')
                    .setLabel('📝 Enviar Sugestão')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💡'),
                new ButtonBuilder()
                    .setCustomId('view_stats')
                    .setLabel('📊 Estatísticas')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📈')
            );
        
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Embed enviado em ${channel}`, ephemeral: true });
    }
}

async function handleButton(interaction) {
    const { customId, user, guildId } = interaction;
    
    if (db.isUserBanned(user.id, guildId)) {
        return interaction.reply({
            content: '❌ Você está banido do sistema!',
            ephemeral: true
        });
    }
    
    if (customId === 'send_suggestion') {
        if (db.isOnCooldown(user.id)) {
            const remaining = Math.ceil(db.getCooldownRemaining(user.id));
            return interaction.reply({
                content: `❌ Aguarde ${remaining} segundos!`,
                ephemeral: true
            });
        }
        
        await interaction.showModal(createSuggestionModal());
    }
    
    if (customId === 'view_stats') {
        const embed = createStatsEmbed(guildId);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleModal(interaction) {
    if (interaction.customId === 'suggestion_modal') {
        const title = interaction.fields.getTextInputValue('suggestion_title');
        const description = interaction.fields.getTextInputValue('suggestion_description');
        const category = interaction.fields.getTextInputValue('suggestion_category');
        const content = `**${title}**\n\n${description}`;
        
        const suggestionsChannelId = db.getSuggestionsChannel(interaction.guildId);
        if (!suggestionsChannelId) {
            return interaction.reply({
                content: '❌ Sistema não configurado!',
                ephemeral: true
            });
        }
        
        const channel = interaction.guild.channels.cache.get(suggestionsChannelId);
        if (!channel) {
            return interaction.reply({
                content: '❌ Canal não encontrado!',
                ephemeral: true
            });
        }
        
        if (db.isOnCooldown(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Aguarde antes de enviar outra sugestão!',
                ephemeral: true
            });
        }
        
        const suggestion = db.createSuggestion(interaction.guildId, interaction.user.id, content, category);
        db.addToCooldown(interaction.user.id);
        
        const embed = createSuggestionEmbed(suggestion, interaction.user);
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_up_${suggestion.id}`)
                    .setLabel('0')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('👍'),
                new ButtonBuilder()
                    .setCustomId(`vote_down_${suggestion.id}`)
                    .setLabel('0')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('👎')
            );
        
        const message = await channel.send({ embeds: [embed], components: [row] });
        db.suggestionMessageIds.set(suggestion.id, message.id);
        
        await interaction.reply({
            content: `✅ Sugestão enviada em ${channel}! ID: ${suggestion.id.split('_')[1]}`,
            ephemeral: true
        });
        
        db.addModerationLog(interaction.guildId, 'suggestion_created', interaction.user.id, suggestion.id, title);
    }
}

// Botões de voto
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const { customId, user, guildId } = interaction;
    
    if (customId.startsWith('vote_up_') || customId.startsWith('vote_down_')) {
        const suggestionId = customId.split('_')[2];
        const voteType = customId.startsWith('vote_up_') ? 'up' : 'down';
        
        const suggestion = db.getSuggestion(suggestionId);
        if (!suggestion) {
            return interaction.reply({ content: '❌ Sugestão não encontrada!', ephemeral: true });
        }
        
        if (suggestion.userId === user.id) {
            return interaction.reply({ content: '❌ Não vote na sua própria sugestão!', ephemeral: true });
        }
        
        db.voteOnSuggestion(suggestionId, user.id, voteType);
        
        const updatedEmbed = createSuggestionEmbed(suggestion, user);
        const updatedRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_up_${suggestionId}`)
                    .setLabel(`${suggestion.votesUp}`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('👍'),
                new ButtonBuilder()
                    .setCustomId(`vote_down_${suggestionId}`)
                    .setLabel(`${suggestion.votesDown}`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('👎')
            );
        
        await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
    }
});

// Comandos administrativos via mensagem
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!isOwner(message.author.id)) return;
    
    if (message.content.startsWith('!suggestion_ban')) {
        const args = message.content.split(' ');
        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Uso: !suggestion_ban @user [motivo]');
        }
        
        const reason = args.slice(2).join(' ') || 'Sem motivo';
        db.banUser(user.id, reason, message.guild.id, message.author.id);
        message.reply(`✅ ${user.tag} banido. Motivo: ${reason}`);
    }
    
    if (message.content.startsWith('!suggestion_unban')) {
        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('Uso: !suggestion_unban @user');
        }
        
        db.unbanUser(user.id);
        message.reply(`✅ ${user.tag} desbanido.`);
    }
    
    if (message.content.startsWith('!suggestion_status')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            return message.reply('Uso: !suggestion_status <id> <status> [motivo]');
        }
        
        const suggestionId = args[1];
        const newStatus = args[2];
        const reason = args.slice(3).join(' ');
        
        const suggestion = db.getSuggestion(suggestionId);
        if (!suggestion) {
            return message.reply('❌ Sugestão não encontrada!');
        }
        
        db.updateSuggestionStatus(suggestionId, newStatus, message.author.id, reason);
        message.reply(`✅ Sugestão #${suggestionId.split('_')[1]} atualizada para ${newStatus}`);
        
        // Atualizar mensagem
        const channelId = db.getSuggestionsChannel(message.guild.id);
        if (channelId) {
            const channel = message.guild.channels.cache.get(channelId);
            const msgId = db.suggestionMessageIds.get(suggestionId);
            if (channel && msgId) {
                try {
                    const msg = await channel.messages.fetch(msgId);
                    const updatedEmbed = createSuggestionEmbed(suggestion, client.user);
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`vote_up_${suggestionId}`)
                                .setLabel(`${suggestion.votesUp}`)
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('👍'),
                            new ButtonBuilder()
                                .setCustomId(`vote_down_${suggestionId}`)
                                .setLabel(`${suggestion.votesDown}`)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('👎')
                        );
                    await msg.edit({ embeds: [updatedEmbed], components: [row] });
                } catch (err) {}
            }
        }
    }
    
    if (message.content === '!suggestion_ping') {
        message.reply('🏓 Pong! Bot está online!');
    }
});

// Função de reconexão automática
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

function connectBot() {
    client.login(TOKEN).catch((error) => {
        console.error(`❌ Falha na conexão (tentativa ${reconnectAttempts + 1}/${maxReconnectAttempts}):`, error.message);
        
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(5000 * reconnectAttempts, 60000);
            console.log(`🔄 Tentando reconectar em ${delay/1000} segundos...`);
            setTimeout(connectBot, delay);
        } else {
            console.error('❌ Número máximo de tentativas atingido. Encerrando...');
            process.exit(1);
        }
    });
}

connectBot();

console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     🚀 Bot de Sugestões Iniciando...                    ║
║                                                          ║
║     📝 Sistema de sugestões                             ║
║     👑 Apenas o owner pode executar comandos           ║
║     💡 Comandos: /suggestions e /suggestionschannel    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
