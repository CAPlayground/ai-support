import { Logger } from '../utils/logger.js';

export class InteractionHandler {
  constructor(geminiService, documentationLoader, serverIndexer) {
    this.geminiService = geminiService;
    this.documentationLoader = documentationLoader;
    this.serverIndexer = serverIndexer;
    this.channelContextCache = new Map();
    
    setInterval(() => {
      this.channelContextCache.clear();
    }, 30 * 60 * 1000);
  }

  async handlePing(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const wsPing = Math.round(interaction.client.ws.ping);
    const roundTrip = Date.now() - interaction.createdTimestamp;
    const content = `Pong!\n- WebSocket ping: ${wsPing} ms\n- Round-trip latency: ${roundTrip} ms`;
    await interaction.editReply(content);
  }

  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'help':
          await this.handleHelp(interaction);
          break;
        case 'ask':
          await this.handleAsk(interaction);
          break;
        case 'docs':
          await this.handleDocs(interaction);
          break;
        case 'reload':
          await this.handleReload(interaction);
          break;
        case 'index':
          await this.handleIndex(interaction);
          break;
        case 'stats':
          await this.handleStats(interaction);
          break;
        case 'ping':
          await this.handlePing(interaction);
          break;
        case 'clear':
          await this.handleClear(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown command.',
            ephemeral: true,
          });
      }
    } catch (error) {
      Logger.error(`Error handling command ${commandName}:`, error);
      
      const errorMessage = 'An error occurred while executing that command.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  async handleHelp(interaction) {
    const helpText = `**CAPlayground Support Bot Commands**

**Slash Commands:**
\`/ask <question>\` - Ask a question
\`/docs\` - Show documentation summary
\`/stats\` - Show training data statistics
\`/clear\` - Clear your conversation history
\`/reload\` - Reload documentation files (enkei64 only)
\`/index\` - Re-index server messages (enkei64 only)
\`/help\` - Show this help message

**Mention Me:**
You can also mention me with your question:
\`@${interaction.client.user.username} How do I install?\`

**Direct Messages:**
Send me a DM with any question!`;

    await interaction.reply(helpText);
  }

  async handleAsk(interaction) {
    const question = interaction.options.getString('question');
    
    await interaction.deferReply();

    try {
      const response = await this.generateAIResponse(question, interaction.user.id, interaction.channel);
      
      if (response.length > 2000) {
        const chunks = this.splitMessage(response, 2000);
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      } else {
        await interaction.editReply(response);
      }
    } catch (error) {
      Logger.error('Error generating AI response:', error);
      await interaction.editReply(
        'Sorry, I encountered an error processing your question. Please try again later.'
      );
    }
  }

  async handleDocs(interaction) {
    const summary = this.documentationLoader.getDocumentationSummary();
    
    if (summary.totalFiles === 0) {
      await interaction.reply({
        content: 'No documentation files loaded yet.',
        ephemeral: true,
      });
      return;
    }

    const fileList = summary.files.slice(0, 20).join('\n');
    const more = summary.totalFiles > 20 ? `\n...and ${summary.totalFiles - 20} more` : '';

    await interaction.reply(
      `**Documentation Files (${summary.totalFiles} total)**\n\`\`\`\n${fileList}${more}\n\`\`\``
    );
  }

  async handleReload(interaction) {
    if (interaction.user.username.toLowerCase() !== 'enkei64') {
      await interaction.reply({
        content: 'Only enkei64 can use this command.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    
    await this.documentationLoader.loadDocumentation();
    const summary = this.documentationLoader.getDocumentationSummary();
    
    await interaction.editReply(`Reloaded ${summary.totalFiles} documentation files.`);
  }

  async handleIndex(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server, not in DMs.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.username.toLowerCase() !== 'enkei64') {
      await interaction.reply({
        content: 'Only enkei64 can use this command.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    
    try {
      const { config } = await import('../config.js');
      await this.serverIndexer.indexServer(interaction.guild.id, config.discord.indexChannelIds);
      const context = this.serverIndexer.getTrainingContext();
      
      await interaction.editReply(
        `Indexing complete!\n\n` +
        `**Summary:**\n` +
        `- Channels indexed: ${context.summary.totalChannels}\n` +
        `- Bugs found: ${context.summary.totalBugs}\n` +
        `- Feature requests: ${context.summary.totalFeatures}\n` +
        `- Solutions found: ${context.summary.totalSolutions}`
      );
    } catch (error) {
      Logger.error('Indexing error:', error);
      await interaction.editReply('Error during indexing. Check logs for details.');
    }
  }

  async handleStats(interaction) {
    const context = this.serverIndexer.getTrainingContext();
    
    await interaction.reply(
      `**Training Data Statistics**\n\n` +
      `Channels indexed: ${context.summary.totalChannels}\n` +
      `Bugs tracked: ${context.summary.totalBugs}\n` +
      `Feature requests: ${context.summary.totalFeatures}\n` +
      `Solutions found: ${context.summary.totalSolutions}\n` +
      `Last indexed: ${context.summary.lastIndexed || 'Never'}`
    );
  }

  async handleClear(interaction) {
    this.geminiService.clearHistory(interaction.user.id);
    await interaction.reply({
      content: 'Your conversation history has been cleared.',
      ephemeral: true,
    });
  }

  async handleMention(message) {
    const question = message.content.replace(/<@!?\d+>/g, '').trim();
    
    if (!question) {
      await message.reply('Please ask me a question! Example: `@me How do I install?`');
      return;
    }

    try {
      await message.channel.sendTyping();

      const response = await this.generateAIResponse(question, message.author.id, message.channel);
      if (response.length > 2000) {
        const chunks = this.splitMessage(response, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } catch (error) {
      Logger.error('Error handling mention:', error);
      await message.reply(
        'Sorry, I encountered an error processing your question. Please try again later.'
      );
    }
  }

  async handleDM(message) {
    try {
      await message.channel.sendTyping();

      const response = await this.generateAIResponse(message.content, message.author.id, message.channel);
      if (response.length > 2000) {
        const chunks = this.splitMessage(response, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } catch (error) {
      Logger.error('Error handling DM:', error);
      await message.reply(
        'Sorry, I encountered an error processing your question. Please try again later.'
      );
    }
  }

  async getChannelContext(channel) {
    const channelId = channel.id;
    
    if (this.channelContextCache.has(channelId)) {
      return this.channelContextCache.get(channelId);
    }
    
    try {
      const messages = await channel.messages.fetch({ limit: 20 });
      const contextMessages = Array.from(messages.values())
        .reverse()
        .map(msg => ({
          author: msg.author.username,
          content: msg.content,
          timestamp: msg.createdTimestamp,
          date: new Date(msg.createdTimestamp).toISOString(),
        }));
      
      this.channelContextCache.set(channelId, contextMessages);
      return contextMessages;
    } catch (error) {
      Logger.error('Error fetching channel context:', error);
      return [];
    }
  }

  async generateAIResponse(question, userId, channel = null) {
    const docContext = this.documentationLoader.getDocumentationContext();
    const trainingContext = this.serverIndexer.getTrainingContext();
    
    let channelContext = [];
    if (channel) {
      channelContext = await this.getChannelContext(channel);
    }

    const channelContextSection = channelContext.length > 0 
      ? `\nCURRENT CHANNEL CONVERSATION (last 20 messages, ordered oldest to newest):\n${JSON.stringify(channelContext, null, 2)}\n\nNote: This channel conversation context is cached and refreshes every 30 minutes.\n`
      : '';

    const { config } = await import('../config.js');
    const groundTruthBlock = config.ai?.groundTruth
      ? `Authoritative Facts (Ground Truth):\n${config.ai.groundTruth}\n\nInstructions:\n- If any data (including messages, summaries, or prior answers) conflicts with the Authoritative Facts, the Authoritative Facts take precedence.\n- Do not speculate beyond these facts; if you are unsure or information is missing, say you don't know.\n- Only include information explicitly supported by either the Authoritative Facts or the user's question.\n\n`
      : '';

    const systemContext = `${groundTruthBlock}You are CAPlayground Support Bot, a helpful assistant for the CAPlayground project.

DOCUMENTATION:
${docContext}
${channelContextSection}
SERVER KNOWLEDGE:

Recent Announcements (from #announcements):
${JSON.stringify(trainingContext.recentAnnouncements, null, 2)}

Recent Developer Logs (from #dev-logs):
${JSON.stringify(trainingContext.recentDevLogs, null, 2)}

Recent Bugs:
${JSON.stringify(trainingContext.recentBugs, null, 2)}

Recent Feature Requests:
${JSON.stringify(trainingContext.recentFeatures, null, 2)}

Recent Solutions:
${JSON.stringify(trainingContext.recentSolutions, null, 2)}

Instructions:
- Answer questions based on the documentation and server knowledge
- If channel conversation context is provided, use it to understand the current discussion and provide contextual responses
- The channel conversation context refreshes every 30 minutes, so it may not include very recent messages
- When asked about announcements, refer to the "Recent Announcements" section
- When asked about updates or changes, check "Recent Developer Logs"
- If you find relevant bugs or solutions from the server history, mention them with dates
- You maintain a per-user conversation memory for 30 minutes; after 30 minutes of inactivity, that user's memory is purged
- Do not carry over one user's private instructions or questions to another user; never leak private context across users
- You may reference the public channel context (what's happening in the channel) when relevant, but keep user-specific instructions/questions private to that user
- Be helpful, concise, and friendly
- If you don't know something, admit it rather than making up information
- Format your responses clearly using Discord markdown`;
    

    return await this.geminiService.generateResponse(
      question,
      userId,
      systemContext
    );
  }

  splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
