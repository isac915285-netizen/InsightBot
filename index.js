// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, REST, Routes } = require('discord.js');

// Configuração do cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Variáveis de ambiente
const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

// Verificar configurações
if (!TOKEN) {
    console.error('❌ TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('❌ OWNER_ID não encontrado no arquivo .env');
    process.exit(1);
}

// Banco de dados
class Database {
    constructor() {
        this.suggestionsChannel = new Map();
        this.suggestions = new Map();
        this.suggestionCounter = new Map();
        this.suggestionMessages = new Map();
        this.userVotes = new Map();
        this.cooldown = new Map();
    }

    setSuggestionsChannel(guildId, channelId) {
        this.suggestionsChannel.set(guildId, channelId);
        return true;
    }

    getSuggestionsChannel(guildId) {
        return this.suggestionsChannel.get(guildId);
    }

    createSuggestion(guildId, userId, content) {
        const current = this.suggestionCounter.get(guildId) || 0;
        const newId = current + 1;
        this.suggestionCounter.set(guildId, newId);
        
        const suggestionId = `${guildId}_${newId}`;
        const suggestionData = {
            id: suggestionId,
            number: newId,
            guildId,
            userId,
            content,
            createdAt: new Date(),
            upvotes: 0,
            downvotes: 0
        };

        this.suggestions.set(suggestionId, suggestionData);
        return suggestionData;
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

    addVote(suggestionId, userId, voteType) {
        const key = `${suggestionId}_${userId}`;
        const currentVote = this.userVotes.get(key);
        
        const suggestion = this.suggestions.get(suggestionId);
        if (!suggestion) return null;
        
        // Remove voto anterior se existir
        if (currentVote === 'up') suggestion.upvotes--;
        if (currentVote === 'down') suggestion.downvotes--;
        
        // Adiciona novo voto
        if (voteType === 'up') {
            suggestion.upvotes++;
            this.userVotes.set(key, 'up');
        } else if (voteType === 'down') {
            suggestion.downvotes++;
            this.userVotes.set(key, 'down');
        } else if (voteType === 'remove') {
            this.userVotes.delete(key);
        }
        
        return suggestion;
    }

    getUserVote(suggestionId, userId) {
        const key = `${suggestionId}_${userId}`;
        return this.userVotes.get(key);
    }

    isOnCooldown(userId, cooldownSeconds = 60) {
        const lastTime = this.cooldown.get(userId);
        if (!lastTime) return false;
        return (Date.now() - lastTime) < (cooldownSeconds * 1000);
    }

    setCooldown(userId) {
        this.cooldown.set(userId, Date.now());
    }

    getCooldownRemaining(userId, cooldownSeconds = 60) {
        const lastTime = this.cooldown.get(userId);
        if (!lastTime) return 0;
        const elapsed = (Date.now() - lastTime) / 1000;
        return Math.max(0, cooldownSeconds - elapsed);
    }

    saveMessageId(suggestionId, messageId) {
        this.suggestionMessages.set(suggestionId, messageId);
    }

    getMessageId(suggestionId) {
        return this.suggestionMessages.get(suggestionId);
    }
}

const db = new Database();

// Verificar se é owner
function isOwner(userId) {
    return userId === OWNER_ID;
}

// Criar embed de sugestão
function createSuggestionEmbed(suggestion) {
    const embed = new EmbedBuilder()
        .setTitle(`💡 Sugestão #${suggestion.number}`)
        .setDescription(suggestion.content)
        .setColor(0x5865F2)
        .addFields(
            { name: '👤 Autor', value: `<@${suggestion.userId}>`, inline: true },
            { name: '📅 Data', value: `<t:${Math.floor(suggestion.createdAt.getTime() / 1000)}:R>`, inline: true },
            { name: '👍 Votos Positivos', value: `${suggestion.upvotes}`, inline: true },
            { name: '👎 Votos Negativos', value: `${suggestion.downvotes}`, inline: true },
            { name: '📊 Total de Votos', value: `${suggestion.upvotes + suggestion.downvotes}`, inline: true }
        )
        .setFooter({ text: 'Reaja com 👍 ou 👎 para votar' })
        .setTimestamp();
    
    return embed;
}

// Criar embed do canal de sugestões
function createSuggestionsChannelEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('📝 Sistema de Sugestões')
        .setDescription('Bem-vindo ao canal de sugestões! Aqui você pode compartilhar suas ideias para melhorar o servidor.')
        .setColor(0x5865F2)
        .addFields(
            { 
                name: '📌 Como funciona', 
                value: '• Envie sua sugestão usando o comando `/suggest`\n• Outros membros votam com 👍 ou 👎\n• As melhores sugestões serão implementadas', 
                inline: false 
            },
            { 
                name: '✅ Regras', 
                value: '• Seja claro e específico\n• Explique o motivo da sugestão\n• Evite sugestões duplicadas\n• Seja respeitoso', 
                inline: false 
            },
            { 
                name: '💡 Dicas', 
                value: '• Sugestões bem elaboradas recebem mais votos\n• Inclua exemplos se possível\n• Mostre como isso beneficia o servidor', 
                inline: false 
            },
            { 
                name: '🎯 Como votar', 
                value: '• 👍 = A favor da sugestão\n• 👎 = Contra a sugestão\n• Clique nas reações abaixo da mensagem', 
                inline: false 
            }
        )
        .setFooter({ text: 'Use /suggest para enviar sua sugestão' })
        .setTimestamp();
    
    return embed;
}

// Criar modal de sugestão
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
        .setPlaceholder('Explique sua sugestão em detalhes...\n\nPor que isso seria bom para o servidor?\nComo isso poderia ser implementado?')
        .setRequired(true)
        .setMaxLength(2000);
    
    const firstRow = new ActionRowBuilder().addComponents(titleInput);
    const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(firstRow, secondRow);
    
    return modal;
}

// Comandos
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
    },
    {
        name: 'suggest',
        description: 'Envia uma nova sugestão',
        options: []
    }
];

// Registrar comandos
const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    console.log(`👑 Owner ID: ${OWNER_ID}`);
    
    try {
        console.log('🔄 Registrando comandos slash...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos registrados com sucesso!');
        console.log('📝 Comandos disponíveis:');
        console.log('   • /suggestions <channel> - Configurar canal');
        console.log('   • /suggestionschannel <channel> - Enviar embed');
        console.log('   • /suggest - Enviar sugestão');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
    
    client.user.setPresence({
        activities: [{ name: '/suggest | Sistema de Sugestões', type: 3 }],
        status: 'online'
    });
});

// Handler de interações
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isCommand()) {
            await handleCommand(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        const errorMsg = { content: '❌ Ocorreu um erro. Tente novamente.', ephemeral: true };
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(errorMsg).catch(() => {});
        }
    }
});

async function handleCommand(interaction) {
    const { commandName, user, guildId } = interaction;
    
    if (!guildId) {
        return interaction.reply({ content: '❌ Este comando só pode ser usado em servidores!', ephemeral: true });
    }
    
    // Comandos administrativos (apenas owner)
    if (commandName === 'suggestions' || commandName === 'suggestionschannel') {
        if (!isOwner(user.id)) {
            return interaction.reply({
                content: '❌ Você não tem permissão para usar este comando. Apenas o owner do bot pode executá-lo.',
                ephemeral: true
            });
        }
    }
    
    switch (commandName) {
        case 'suggestions':
            await handleSuggestionsCommand(interaction);
            break;
        case 'suggestionschannel':
            await handleSuggestionsChannelCommand(interaction);
            break;
        case 'suggest':
            await handleSuggestCommand(interaction);
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
    const sentMessage = await channel.send({ embeds: [embed] });
    
    // Adicionar reações ao embed
    await sentMessage.react('👍');
    await sentMessage.react('👎');
    
    await interaction.reply({ content: `✅ Embed de sugestões enviado em ${channel}`, ephemeral: true });
}

async function handleSuggestCommand(interaction) {
    // Verificar cooldown
    if (db.isOnCooldown(interaction.user.id)) {
        const remaining = Math.ceil(db.getCooldownRemaining(interaction.user.id));
        return interaction.reply({
            content: `❌ Aguarde ${remaining} segundos antes de enviar outra sugestão.`,
            ephemeral: true
        });
    }
    
    const modal = createSuggestionModal();
    await interaction.showModal(modal);
}

async function handleModal(interaction) {
    if (interaction.customId === 'suggestion_modal') {
        const title = interaction.fields.getTextInputValue('suggestion_title');
        const description = interaction.fields.getTextInputValue('suggestion_description');
        const content = `**${title}**\n\n${description}`;
        
        const suggestionsChannelId = db.getSuggestionsChannel(interaction.guildId);
        
        if (!suggestionsChannelId) {
            return interaction.reply({
                content: '❌ O sistema de sugestões não está configurado. Contate o administrador.',
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
        
        // Criar sugestão
        const suggestion = db.createSuggestion(interaction.guildId, interaction.user.id, content);
        db.setCooldown(interaction.user.id);
        
        // Criar embed
        const embed = createSuggestionEmbed(suggestion);
        
        // Enviar mensagem
        const message = await channel.send({ embeds: [embed] });
        
        // Adicionar reações
        await message.react('👍');
        await message.react('👎');
        
        // Salvar ID da mensagem
        db.saveMessageId(suggestion.id, message.id);
        
        await interaction.reply({
            content: `✅ Sua sugestão #${suggestion.number} foi enviada com sucesso no canal ${channel}!`,
            ephemeral: true
        });
    }
}

// Handler para reações (votos)
client.on('messageReactionAdd', async (reaction, user) => {
    // Ignorar bots
    if (user.bot) return;
    
    // Verificar se é uma reação de voto
    if (reaction.emoji.name !== '👍' && reaction.emoji.name !== '👎') return;
    
    // Aguardar cache da mensagem
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Erro ao buscar reação:', error);
            return;
        }
    }
    
    const message = reaction.message;
    const guild = message.guild;
    
    if (!guild) return;
    
    // Verificar se a mensagem é uma sugestão
    let suggestionId = null;
    let suggestionNumber = null;
    
    for (const [id, msgId] of db.suggestionMessages) {
        if (msgId === message.id) {
            suggestionId = id;
            const suggestion = db.getSuggestion(id);
            if (suggestion) {
                suggestionNumber = suggestion.number;
            }
            break;
        }
    }
    
    if (!suggestionId) return;
    
    const suggestion = db.getSuggestion(suggestionId);
    if (!suggestion) return;
    
    // Impedir autor de votar na própria sugestão
    if (suggestion.userId === user.id) {
        await reaction.users.remove(user.id);
        return;
    }
    
    const voteType = reaction.emoji.name === '👍' ? 'up' : 'down';
    const currentVote = db.getUserVote(suggestionId, user.id);
    
    // Se já votou no mesmo tipo, remove o voto
    if (currentVote === voteType) {
        db.addVote(suggestionId, user.id, 'remove');
        await reaction.users.remove(user.id);
    } 
    // Se votou no oposto, muda o voto
    else if (currentVote && currentVote !== voteType) {
        db.addVote(suggestionId, user.id, voteType);
        
        // Remover reação oposta se existir
        const oppositeEmoji = reaction.emoji.name === '👍' ? '👎' : '👍';
        const oppositeReaction = message.reactions.cache.get(oppositeEmoji);
        if (oppositeReaction) {
            await oppositeReaction.users.remove(user.id);
        }
    } 
    // Novo voto
    else {
        db.addVote(suggestionId, user.id, voteType);
    }
    
    // Atualizar embed com novos votos
    const updatedSuggestion = db.getSuggestion(suggestionId);
    const updatedEmbed = createSuggestionEmbed(updatedSuggestion);
    await message.edit({ embeds: [updatedEmbed] });
});

// Handler para remoção de reações
client.on('messageReactionRemove', async (reaction, user) => {
    // Ignorar bots
    if (user.bot) return;
    
    // Verificar se é uma reação de voto
    if (reaction.emoji.name !== '👍' && reaction.emoji.name !== '👎') return;
    
    // Aguardar cache da mensagem
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Erro ao buscar reação:', error);
            return;
        }
    }
    
    const message = reaction.message;
    
    // Verificar se a mensagem é uma sugestão
    let suggestionId = null;
    for (const [id, msgId] of db.suggestionMessages) {
        if (msgId === message.id) {
            suggestionId = id;
            break;
        }
    }
    
    if (!suggestionId) return;
    
    const suggestion = db.getSuggestion(suggestionId);
    if (!suggestion) return;
    
    // Remover voto
    db.addVote(suggestionId, user.id, 'remove');
    
    // Atualizar embed
    const updatedSuggestion = db.getSuggestion(suggestionId);
    const updatedEmbed = createSuggestionEmbed(updatedSuggestion);
    await message.edit({ embeds: [updatedEmbed] });
});

// Comandos administrativos via mensagem (apenas owner)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!isOwner(message.author.id)) return;
    
    if (message.content === '!suggestions_stats') {
        const suggestions = db.getAllSuggestions(message.guild.id);
        const total = suggestions.length;
        const totalUpvotes = suggestions.reduce((sum, s) => sum + s.upvotes, 0);
        const totalDownvotes = suggestions.reduce((sum, s) => sum + s.downvotes, 0);
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Estatísticas do Sistema de Sugestões')
            .setColor(0x5865F2)
            .addFields(
                { name: '📝 Total de Sugestões', value: `${total}`, inline: true },
                { name: '👍 Total de Votos Positivos', value: `${totalUpvotes}`, inline: true },
                { name: '👎 Total de Votos Negativos', value: `${totalDownvotes}`, inline: true },
                { name: '📊 Média de Votos por Sugestão', value: `${total > 0 ? ((totalUpvotes + totalDownvotes) / total).toFixed(1) : 0}`, inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (message.content === '!suggestions_help') {
        const embed = new EmbedBuilder()
            .setTitle('📚 Comandos do Bot de Sugestões')
            .setColor(0x5865F2)
            .addFields(
                { name: '📝 Comandos Públicos', value: '`/suggest` - Enviar uma nova sugestão', inline: false },
                { name: '👑 Comandos de Admin', value: '`/suggestions <canal>` - Configurar canal de sugestões\n`/suggestionschannel <canal>` - Enviar embed no canal', inline: false },
                { name: '🔧 Comandos via Mensagem (Owner)', value: '`!suggestions_stats` - Ver estatísticas\n`!suggestions_help` - Mostrar esta ajuda', inline: false },
                { name: '💡 Como votar', value: 'Clique em 👍 ou 👎 nas mensagens de sugestão', inline: false }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
    }
    
    if (message.content === '!suggestions_ping') {
        const ping = Date.now() - message.createdTimestamp;
        await message.reply(`🏓 Pong! Latência: ${ping}ms | API: ${Math.round(client.ws.ping)}ms`);
    }
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

// Sistema de reconexão
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
║     📝 Sistema de sugestões com reações                 ║
║     👑 Apenas o owner pode configurar                  ║
║     💡 Comandos:                                        ║
║        • /suggestions - Configurar canal               ║
║        • /suggestionschannel - Enviar embed            ║
║        • /suggest - Enviar sugestão                    ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
