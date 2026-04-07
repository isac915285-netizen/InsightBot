// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuração do cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
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

// Banco de dados em memória (para produção, use um banco de dados real)
class Database {
    constructor() {
        this.suggestionsChannel = new Map(); // guildId -> channelId
        this.suggestions = new Map(); // suggestionId -> suggestionData
        this.suggestionCounter = new Map(); // guildId -> lastId
        this.userSuggestions = new Map(); // userId -> [suggestionIds]
        this.suggestionVotes = new Map(); // suggestionId -> { userIds: Set, votes: Map }
        this.suggestionStatus = new Map(); // suggestionId -> status
        this.suggestionHistory = new Map(); // suggestionId -> history
        this.moderationLogs = new Map(); // guildId -> logs
        this.bannedUsers = new Map(); // userId -> { reason, date, guildId }
        this.cooldown = new Map(); // userId -> lastSuggestionTime
        this.suggestionCategories = new Map(); // guildId -> categories
        this.suggestionTags = new Map(); // suggestionId -> tags
        this.userReputation = new Map(); // userId -> reputation
        this.suggestionComments = new Map(); // suggestionId -> comments
        this.suggestionMessageIds = new Map(); // suggestionId -> messageId
    }

    setSuggestionsChannel(guildId, channelId) {
        this.suggestionsChannel.set(guildId, channelId);
        return true;
    }

    getSuggestionsChannel(guildId) {
        return this.suggestionsChannel.get(guildId);
    }

    createSuggestion(guildId, userId, content, category = 'geral', tags = []) {
        const suggestionId = this.generateSuggestionId(guildId);
        const suggestionData = {
            id: suggestionId,
            guildId,
            userId,
            content,
            category,
            tags,
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
            // Remove o voto
            votes.delete(userId);
            if (voteType === 'up') suggestion.votesUp--;
            else suggestion.votesDown--;
        } else {
            // Muda ou adiciona voto
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

    getSuggestionHistory(suggestionId) {
        return this.suggestionHistory.get(suggestionId) || [];
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

    likeComment(suggestionId, commentId, userId) {
        const comments = this.suggestionComments.get(suggestionId);
        if (!comments) return false;
        
        const comment = comments.find(c => c.id === commentId);
        if (!comment) return false;
        
        if (comment.likedBy.includes(userId)) {
            comment.likes--;
            comment.likedBy = comment.likedBy.filter(id => id !== userId);
        } else {
            comment.likes++;
            comment.likedBy.push(userId);
        }
        
        return true;
    }

    addToCooldown(userId) {
        this.cooldown.set(userId, Date.now());
    }

    isOnCooldown(userId, cooldownSeconds = 60) {
        const lastTime = this.cooldown.get(userId);
        if (!lastTime) return false;
        return (Date.now() - lastTime) < (cooldownSeconds * 1000);
    }

    getCooldownRemaining(userId, cooldownSeconds = 60) {
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

    createCategory(guildId, name) {
        if (!this.suggestionCategories.has(guildId)) {
            this.suggestionCategories.set(guildId, []);
        }
        
        const categories = this.suggestionCategories.get(guildId);
        const category = { id: Date.now(), name, createdAt: new Date() };
        categories.push(category);
        return category;
    }

    getCategories(guildId) {
        return this.suggestionCategories.get(guildId) || [];
    }

    deleteCategory(guildId, categoryId) {
        const categories = this.suggestionCategories.get(guildId);
        if (!categories) return false;
        
        const index = categories.findIndex(c => c.id === categoryId);
        if (index === -1) return false;
        
        categories.splice(index, 1);
        return true;
    }
}

const db = new Database();

// Função para verificar se o usuário é o owner
function isOwner(userId) {
    return userId === OWNER_ID;
}

// Função para criar embed de sugestão
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
            { name: '👍 Votos Positivos', value: `${suggestion.votesUp}`, inline: true },
            { name: '👎 Votos Negativos', value: `${suggestion.votesDown}`, inline: true },
            { name: '📊 Status', value: `${statusEmojis[suggestion.status]} ${statusTexts[suggestion.status]}`, inline: true }
        )
        .setFooter({ text: `ID: ${suggestion.id}`, iconURL: user?.displayAvatarURL() })
        .setTimestamp();
    
    if (suggestion.tags && suggestion.tags.length > 0) {
        embed.addFields({ name: '🏷️ Tags', value: suggestion.tags.map(t => `#${t}`).join(' '), inline: false });
    }
    
    if (suggestion.rejectionReason) {
        embed.addFields({ name: '❌ Motivo da Rejeição', value: suggestion.rejectionReason, inline: false });
    }
    
    if (suggestion.implementedAt) {
        embed.addFields({ name: '✅ Implementado em', value: `<t:${Math.floor(suggestion.implementedAt.getTime() / 1000)}:R>`, inline: true });
    }
    
    return embed;
}

// Função para criar embed do canal de sugestões
function createSuggestionsChannelEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('📝 Sistema de Sugestões')
        .setDescription('Bem-vindo ao canal de sugestões! Aqui você pode compartilhar suas ideias para melhorar o servidor.')
        .setColor(0x5865F2)
        .addFields(
            { name: '📌 Como funciona', value: 'Clique no botão abaixo para enviar uma sugestão. Sua sugestão será analisada pela equipe e votada pelos membros.', inline: false },
            { name: '✅ Regras', value: '• Seja claro e específico\n• Explique o motivo da sugestão\n• Evite sugestões duplicadas\n• Seja respeitoso', inline: false },
            { name: '⭐ Dicas', value: '• Sugestões bem elaboradas têm mais chances\n• Inclua exemplos se possível\n• Mostre como isso beneficia o servidor', inline: false },
            { name: '🎯 Status', value: '• ⏳ Pendente: Aguardando análise\n• 🔍 Em análise: Sendo avaliado\n• ✅ Aprovado: Será implementado\n• ❌ Rejeitado: Não será implementado\n• 🎉 Implementado: Já foi adicionado', inline: false },
            { name: '🏆 Reputação', value: 'Suas sugestões aprovadas aumentam sua reputação! Membros com alta reputação têm benefícios especiais.', inline: false }
        )
        .setFooter({ text: 'Clique no botão abaixo para enviar sua sugestão' })
        .setTimestamp();
    
    return embed;
}

// Função para criar embed de estatísticas
function createStatsEmbed(guildId) {
    const suggestions = db.getAllSuggestions(guildId);
    const total = suggestions.length;
    const pending = suggestions.filter(s => s.status === 'pendente').length;
    const approved = suggestions.filter(s => s.status === 'aprovado').length;
    const rejected = suggestions.filter(s => s.status === 'rejeitado').length;
    const implemented = suggestions.filter(s => s.status === 'implementado').length;
    
    const totalVotes = suggestions.reduce((sum, s) => sum + s.totalVotes, 0);
    const avgVotes = total > 0 ? (totalVotes / total).toFixed(1) : 0;
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas do Sistema de Sugestões')
        .setColor(0x5865F2)
        .addFields(
            { name: '📝 Total de Sugestões', value: `${total}`, inline: true },
            { name: '⏳ Pendentes', value: `${pending}`, inline: true },
            { name: '✅ Aprovadas', value: `${approved}`, inline: true },
            { name: '❌ Rejeitadas', value: `${rejected}`, inline: true },
            { name: '🎉 Implementadas', value: `${implemented}`, inline: true },
            { name: '📊 Taxa de Aprovação', value: `${total > 0 ? ((approved + implemented) / total * 100).toFixed(1) : 0}%`, inline: true },
            { name: '👍 Total de Votos', value: `${totalVotes}`, inline: true },
            { name: '⭐ Média de Votos', value: `${avgVotes}`, inline: true }
        )
        .setTimestamp();
    
    return embed;
}

// Função para criar modal de sugestão
function createSuggestionModal() {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId('suggestion_modal')
        .setTitle('Enviar Sugestão');
    
    const titleInput = new TextInputBuilder()
        .setCustomId('suggestion_title')
        .setLabel('Título da Sugestão')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Adicionar canal de música')
        .setRequired(true)
        .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
        .setCustomId('suggestion_description')
        .setLabel('Descrição Detalhada')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Explique sua sugestão em detalhes...\n\nPor que isso seria bom para o servidor?\nComo isso poderia ser implementado?\nExistem exemplos similares?')
        .setRequired(true)
        .setMaxLength(2000);
    
    const categoryInput = new TextInputBuilder()
        .setCustomId('suggestion_category')
        .setLabel('Categoria')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Moderação, Diversão, Utilidades')
        .setRequired(true)
        .setMaxLength(50);
    
    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(categoryInput);
    
    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
    
    return modal;
}

// Registrar comandos (apenas os 2 comandos)
const commands = [
    {
        name: 'suggestions',
        description: 'Configura o canal onde as sugestões serão enviadas',
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
        description: 'Envia o embed de sugestões no canal configurado',
        options: [
            {
                name: 'channel',
                description: 'O canal onde as sugestões aparecerão',
                type: 7,
                required: true
            }
        ]
    }
];

// Registrar comandos globalmente
const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    console.log(`👑 Owner ID: ${OWNER_ID}`);
    
    try {
        console.log('🔄 Registrando comandos slash...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados com sucesso!');
        console.log('📝 Comandos disponíveis: /suggestions e /suggestionschannel');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
    
    // Configurar status do bot
    client.user.setPresence({
        activities: [{ name: '/suggestions • Sistema de Sugestões', type: 3 }],
        status: 'online'
    });
});

// Handler de interações
client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        await handleCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
});

async function handleCommand(interaction) {
    const { commandName, user, guildId, channel, options } = interaction;
    
    if (!guildId) {
        return interaction.reply({ content: '❌ Este comando só pode ser usado em servidores!', ephemeral: true });
    }
    
    // Verificar se é owner para ambos os comandos
    if (!isOwner(user.id)) {
        return interaction.reply({
            content: '❌ Você não tem permissão para usar este comando. Apenas o owner do bot pode executá-lo.',
            ephemeral: true
        });
    }
    
    switch (commandName) {
        case 'suggestions':
            await handleSuggestionsCommand(interaction);
            break;
        case 'suggestionschannel':
            await handleSuggestionsChannelCommand(interaction);
            break;
    }
}

async function handleSuggestionsCommand(interaction) {
    const channel = interaction.options.getChannel('channel');
    
    if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: '❌ Por favor, selecione um canal de texto!', ephemeral: true });
    }
    
    db.setSuggestionsChannel(interaction.guildId, channel.id);
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Canal de Sugestões Configurado')
        .setDescription(`O canal de sugestões foi configurado como ${channel}`)
        .setColor(0x00FF00)
        .addFields(
            { name: 'Próximo Passo', value: `Use /suggestionschannel ${channel} para enviar o embed de sugestões neste canal.`, inline: false }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSuggestionsChannelCommand(interaction) {
    const channel = interaction.options.getChannel('channel');
    const suggestionsChannelId = db.getSuggestionsChannel(interaction.guildId);
    
    if (!suggestionsChannelId) {
        return interaction.reply({
            content: '❌ Primeiro configure o canal de sugestões usando /suggestions',
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
                .setEmoji('📈'),
            new ButtonBuilder()
                .setCustomId('view_rules')
                .setLabel('📜 Regras')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋')
        );
    
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Embed de sugestões enviado em ${channel}`, ephemeral: true });
}

async function handleButton(interaction) {
    const { customId, user, guildId } = interaction;
    
    if (db.isUserBanned(user.id, guildId)) {
        return interaction.reply({
            content: '❌ Você está banido de usar o sistema de sugestões neste servidor.',
            ephemeral: true
        });
    }
    
    switch (customId) {
        case 'send_suggestion':
            if (db.isOnCooldown(user.id)) {
                const remaining = db.getCooldownRemaining(user.id);
                return interaction.reply({
                    content: `❌ Aguarde ${Math.ceil(remaining)} segundos antes de enviar outra sugestão.`,
                    ephemeral: true
                });
            }
            
            const modal = createSuggestionModal();
            await interaction.showModal(modal);
            break;
            
        case 'view_stats':
            const embed = createStatsEmbed(guildId);
            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
            
        case 'view_rules':
            const rulesEmbed = new EmbedBuilder()
                .setTitle('📜 Regras do Sistema de Sugestões')
                .setDescription('Siga estas regras para manter o sistema organizado e útil para todos.')
                .setColor(0xFFA500)
                .addFields(
                    { name: '1️⃣ Sugestões Duplicadas', value: 'Verifique se sua sugestão já foi enviada antes de criar uma nova.', inline: false },
                    { name: '2️⃣ Conteúdo Apropriado', value: 'Sugestões ofensivas, inadequadas ou spam serão removidas e resultarão em banimento.', inline: false },
                    { name: '3️⃣ Seja Específico', value: 'Explique sua ideia de forma clara e detalhada para facilitar a avaliação.', inline: false },
                    { name: '4️⃣ Uma Sugestão por Vez', value: 'Cada sugestão deve conter apenas uma ideia principal.', inline: false },
                    { name: '5️⃣ Respeito', value: 'Respeite as opiniões diferentes nos comentários e votações.', inline: false },
                    { name: '6️⃣ Consequências', value: 'O não cumprimento das regras pode resultar em banimento do sistema de sugestões.', inline: false }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
            break;
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
                content: '❌ O canal de sugestões não está configurado. Contate o administrador.',
                ephemeral: true
            });
        }
        
        const channel = interaction.guild.channels.cache.get(suggestionsChannelId);
        if (!channel) {
            return interaction.reply({
                content: '❌ Canal de sugestões não encontrado. Contate o administrador.',
                ephemeral: true
            });
        }
        
        // Verificar cooldown novamente
        if (db.isOnCooldown(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Aguarde antes de enviar outra sugestão.',
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
                    .setLabel(`${suggestion.votesUp}`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('👍'),
                new ButtonBuilder()
                    .setCustomId(`vote_down_${suggestion.id}`)
                    .setLabel(`${suggestion.votesDown}`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('👎'),
                new ButtonBuilder()
                    .setCustomId(`comment_${suggestion.id}`)
                    .setLabel('Comentar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💬')
            );
        
        const message = await channel.send({ embeds: [embed], components: [row] });
        
        // Armazenar ID da mensagem para futuras atualizações
        db.suggestionMessageIds.set(suggestion.id, message.id);
        
        await interaction.reply({
            content: `✅ Sua sugestão foi enviada com sucesso no canal ${channel}! ID: ${suggestion.id.split('_')[1]}`,
            ephemeral: true
        });
        
        // Registrar log de moderação
        db.addModerationLog(interaction.guildId, 'suggestion_created', interaction.user.id, suggestion.id, content.substring(0, 100));
    }
}

// Handler para novos botões de voto e comentário (dinâmicos)
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
            return interaction.reply({ content: '❌ Você não pode votar na sua própria sugestão!', ephemeral: true });
        }
        
        const result = db.voteOnSuggestion(suggestionId, user.id, voteType);
        
        // Atualizar o embed
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
                    .setEmoji('👎'),
                new ButtonBuilder()
                    .setCustomId(`comment_${suggestionId}`)
                    .setLabel('Comentar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💬')
            );
        
        await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
        
        // Registrar voto
        db.addModerationLog(guildId, 'vote', user.id, suggestionId, voteType);
        
    } else if (customId.startsWith('comment_')) {
        const suggestionId = customId.split('_')[1];
        const suggestion = db.getSuggestion(suggestionId);
        
        if (!suggestion) {
            return interaction.reply({ content: '❌ Sugestão não encontrada!', ephemeral: true });
        }
        
        // Criar modal para comentário
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        
        const modal = new ModalBuilder()
            .setCustomId(`comment_modal_${suggestionId}`)
            .setTitle('Adicionar Comentário');
        
        const commentInput = new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel('Seu Comentário')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Digite seu comentário aqui...')
            .setRequired(true)
            .setMaxLength(1000);
        
        const actionRow = new ActionRowBuilder().addComponents(commentInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
    }
});

// Handler para modais de comentário
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    
    if (interaction.customId.startsWith('comment_modal_')) {
        const suggestionId = interaction.customId.replace('comment_modal_', '');
        const comment = interaction.fields.getTextInputValue('comment_text');
        
        const suggestion = db.getSuggestion(suggestionId);
        if (!suggestion) {
            return interaction.reply({ content: '❌ Sugestão não encontrada!', ephemeral: true });
        }
        
        db.addComment(suggestionId, interaction.user.id, comment);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Comentário Adicionado')
            .setDescription(`Seu comentário foi adicionado à sugestão #${suggestionId.split('_')[1]}`)
            .setColor(0x5865F2)
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        
        // Notificar autor
        if (suggestion.userId !== interaction.user.id) {
            const author = await client.users.fetch(suggestion.userId);
            if (author) {
                author.send(`💬 Novo comentário na sua sugestão #${suggestionId.split('_')[1]} de ${interaction.user.username}:\n\n${comment}`).catch(() => {});
            }
        }
    }
});

// Comandos administrativos via mensagem (apenas owner)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!isOwner(message.author.id)) return;
    
    if (message.content.startsWith('!suggestion_ban')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('Uso: !suggestion_ban <@usuário> [motivo]');
        }
        
        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário válido!');
        }
        
        const reason = args.slice(2).join(' ') || 'Sem motivo especificado';
        db.banUser(user.id, reason, message.guild.id, message.author.id);
        
        message.reply(`✅ ${user.tag} foi banido do sistema de sugestões. Motivo: ${reason}`);
        
        // Notificar o usuário
        user.send(`❌ Você foi banido do sistema de sugestões no servidor ${message.guild.name}. Motivo: ${reason}`).catch(() => {});
    }
    
    if (message.content.startsWith('!suggestion_unban')) {
        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('Uso: !suggestion_unban <@usuário>');
        }
        
        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Mencione um usuário válido!');
        }
        
        db.unbanUser(user.id);
        message.reply(`✅ ${user.tag} foi desbanido do sistema de sugestões.`);
        
        user.send(`✅ Você foi desbanido do sistema de sugestões no servidor ${message.guild.name}.`).catch(() => {});
    }
    
    if (message.content.startsWith('!suggestion_logs')) {
        const logs = db.getModerationLogs(message.guild.id, 20);
        if (logs.length === 0) {
            return message.reply('Nenhum log encontrado.');
        }
        
        let logText = '📋 **Últimos Logs do Sistema de Sugestões**\n\n';
        for (const log of logs) {
            logText += `**${log.action.toUpperCase()}** - <@${log.moderatorId}> -> ${log.targetId}\n`;
            logText += `Motivo: ${log.reason || 'N/A'}\n`;
            logText += `Data: ${log.timestamp.toLocaleString()}\n\n`;
        }
        
        // Enviar em partes se necessário
        if (logText.length > 2000) {
            const chunks = [];
            for (let i = 0; i < logText.length; i += 1990) {
                chunks.push(logText.substring(i, i + 1990));
            }
            for (const chunk of chunks) {
                await message.reply(chunk);
            }
        } else {
            await message.reply(logText);
        }
    }
    
    if (message.content.startsWith('!suggestion_export')) {
        const suggestions = db.getAllSuggestions(message.guild.id);
        const exportData = {
            guildId: message.guild.id,
            guildName: message.guild.name,
            exportDate: new Date(),
            totalSuggestions: suggestions.length,
            suggestions: suggestions.map(s => ({
                id: s.id,
                userId: s.userId,
                content: s.content,
                category: s.category,
                createdAt: s.createdAt,
                status: s.status,
                votesUp: s.votesUp,
                votesDown: s.votesDown,
                comments: db.getComments(s.id)
            }))
        };
        
        const fileName = `suggestions_export_${message.guild.id}_${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(exportData, null, 2));
        
        await message.reply({
            content: '📊 Exportação concluída!',
            files: [fileName]
        });
        
        fs.unlinkSync(fileName);
    }
    
    if (message.content.startsWith('!suggestion_status')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            return message.reply('Uso: !suggestion_status <id_da_sugestão> <status> [motivo]\nStatus disponíveis: pendente, aprovado, rejeitado, implementado, em-analise');
        }
        
        const suggestionId = args[1];
        const newStatus = args[2];
        const reason = args.slice(3).join(' ');
        
        const suggestion = db.getSuggestion(suggestionId);
        if (!suggestion) {
            return message.reply('❌ Sugestão não encontrada!');
        }
        
        const validStatus = ['pendente', 'aprovado', 'rejeitado', 'implementado', 'em-analise'];
        if (!validStatus.includes(newStatus)) {
            return message.reply('❌ Status inválido! Use: pendente, aprovado, rejeitado, implementado, em-analise');
        }
        
        if (newStatus === 'rejeitado' && !reason) {
            return message.reply('❌ Para rejeitar uma sugestão, forneça um motivo!');
        }
        
        db.updateSuggestionStatus(suggestionId, newStatus, message.author.id, reason);
        message.reply(`✅ Sugestão #${suggestionId.split('_')[1]} atualizada para **${newStatus}**`);
        
        // Atualizar a mensagem no canal
        const suggestionsChannelId = db.getSuggestionsChannel(message.guild.id);
        if (suggestionsChannelId) {
            const channel = message.guild.channels.cache.get(suggestionsChannelId);
            if (channel) {
                const messageId = db.suggestionMessageIds.get(suggestionId);
                if (messageId) {
                    try {
                        const msg = await channel.messages.fetch(messageId);
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
                                    .setEmoji('👎'),
                                new ButtonBuilder()
                                    .setCustomId(`comment_${suggestionId}`)
                                    .setLabel('Comentar')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setEmoji('💬')
                            );
                        await msg.edit({ embeds: [updatedEmbed], components: [row] });
                    } catch (error) {
                        console.error('Erro ao atualizar mensagem:', error);
                    }
                }
            }
        }
        
        // Notificar autor
        const author = await client.users.fetch(suggestion.userId);
        if (author) {
            author.send(`📝 Sua sugestão #${suggestionId.split('_')[1]} foi atualizada para **${newStatus}**${reason ? `\nMotivo: ${reason}` : ''}`).catch(() => {});
        }
    }
});

// Handler para erros
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

// Iniciar o bot
client.login(TOKEN);

console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     🚀 Bot de Sugestões Iniciando...                    ║
║                                                          ║
║     📝 Sistema completo de sugestões                    ║
║     👑 Apenas o owner pode executar comandos admin     ║
║     💡 Comandos: /suggestions e /suggestionschannel    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
