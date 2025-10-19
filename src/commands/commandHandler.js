import { Logger } from '../utils/logger.js';

export class CommandHandler {
  constructor(prefix, geminiService, documentationLoader, serverIndexer) {
    this.prefix = prefix;
    this.geminiService = geminiService;
    this.documentationLoader = documentationLoader;
    this.serverIndexer = serverIndexer;
    this.commands = this.initializeCommands();
  }

  initializeCommands() {
    return {
      help: {
        description: 'Show available commands',
        execute: async (message) => {
          const commandList = Object.entries(this.commands)
            .map(([name, cmd]) => `\`${this.prefix}${name}\` - ${cmd.description}`)
            .join('\n');

          await message.reply(
            `**CAPlayground Support Bot Commands**\n\n${commandList}\n\n` +
            `You can also mention me or DM me directly with your questions!`
          );
        },
      },

      ask: {
        description: 'Ask a question (e.g., !ask How do I install?)',
        execute: async (message, args) => {
          if (args.length === 0) {
            await message.reply('Please provide a question. Example: `!ask How do I install?`');
            return;
          }

          await this.handleQuestion(message, args.join(' '));
        },
      },

      docs: {
        description: 'Show documentation summary',
        execute: async (message) => {
          const summary = this.documentationLoader.getDocumentationSummary();
          
          if (summary.totalFiles === 0) {
            await message.reply('No documentation files loaded yet.');
            return;
          }

          const fileList = summary.files.slice(0, 20).join('\n');
          const more = summary.totalFiles > 20 ? `\n...and ${summary.totalFiles - 20} more` : '';

          await message.reply(
            `**Documentation Files (${summary.totalFiles} total)**\n\`\`\`\n${fileList}${more}\n\`\`\``
          );
        },
      },

      reload: {
        description: 'Reload documentation files (Admin only)',
        execute: async (message) => {
          if (!message.member.permissions.has('Administrator')) {
            await message.reply('This command requires Administrator permissions.');
            return;
          }

          await message.reply('Reloading documentation...');
          await this.documentationLoader.loadDocumentation();
          const summary = this.documentationLoader.getDocumentationSummary();
          await message.reply(`Reloaded ${summary.totalFiles} documentation files.`);
        },
      },

      index: {
        description: 'Re-index server messages for training (Admin only)',
        execute: async (message) => {
          if (!message.member.permissions.has('Administrator')) {
            await message.reply('This command requires Administrator permissions.');
            return;
          }

          await message.reply('Starting server indexing... This may take a while.');
          
          try {
            await this.serverIndexer.indexServer(message.guild.id);
            const context = this.serverIndexer.getTrainingContext();
            
            await message.reply(
              `Indexing complete!\n\n` +
              `**Summary:**\n` +
              `- Channels indexed: ${context.summary.totalChannels}\n` +
              `- Bugs found: ${context.summary.totalBugs}\n` +
              `- Feature requests: ${context.summary.totalFeatures}\n` +
              `- Solutions found: ${context.summary.totalSolutions}`
            );
          } catch (error) {
            Logger.error('Indexing error:', error);
            await message.reply('❌ Error during indexing. Check logs for details.');
          }
        },
      },

      stats: {
        description: 'Show training data statistics',
        execute: async (message) => {
          const context = this.serverIndexer.getTrainingContext();
          
          await message.reply(
            `**Training Data Statistics**\n\n` +
            `📊 Channels indexed: ${context.summary.totalChannels}\n` +
            `🐛 Bugs tracked: ${context.summary.totalBugs}\n` +
            `✨ Feature requests: ${context.summary.totalFeatures}\n` +
            `✅ Solutions found: ${context.summary.totalSolutions}\n` +
            `🕐 Last indexed: ${context.summary.lastIndexed || 'Never'}`
          );
        },
      },

      clear: {
        description: 'Clear your conversation history',
        execute: async (message) => {
          this.geminiService.clearHistory(message.author.id);
          await message.reply('✅ Your conversation history has been cleared.');
        },
      },
    };
  }

  async handleMessage(message) {
    if (message.author.bot) return;

    if (message.content.startsWith(this.prefix)) {
      await this.handleCommand(message);
      return;
    }

    if (message.mentions.has(message.client.user)) {
      const question = message.content.replace(/<@!?\d+>/g, '').trim();
      if (question) {
        await this.handleQuestion(message, question);
      }
      return;
    }

    if (message.channel.isDMBased()) {
      await this.handleQuestion(message, message.content);
    }
  }

  async handleCommand(message) {
    const args = message.content.slice(this.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = this.commands[commandName];
    if (!command) {
      return;
    }

    try {
      await command.execute(message, args);
    } catch (error) {
      Logger.error(`Error executing command ${commandName}:`, error);
      await message.reply('❌ An error occurred while executing that command.');
    }
  }

  async handleQuestion(message, question) {
    try {
      await message.channel.sendTyping();

      const docContext = this.documentationLoader.getDocumentationContext();
      const trainingContext = this.serverIndexer.getTrainingContext();

      const systemContext = `You are CAPlayground Support Bot, a helpful assistant for the CAPlayground project.

DOCUMENTATION:
${docContext}

SERVER KNOWLEDGE (Recent bugs, features, and solutions):
Bugs: ${JSON.stringify(trainingContext.recentBugs, null, 2)}
Features: ${JSON.stringify(trainingContext.recentFeatures, null, 2)}
Solutions: ${JSON.stringify(trainingContext.recentSolutions, null, 2)}

Instructions:
- Answer questions based on the documentation and server knowledge
- If you find relevant bugs or solutions from the server history, mention them
- Be helpful, concise, and friendly
- If you don't know something, admit it rather than making up information
- Format your responses clearly using Discord markdown`;

      const response = await this.geminiService.generateResponse(
        question,
        message.author.id,
        systemContext
      );

      if (response.length > 2000) {
        const chunks = this.splitMessage(response, 2000);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } catch (error) {
      Logger.error('Error handling question:', error);
      await message.reply(
        'Sorry, I encountered an error processing your question. Please try again later.'
      );
    }
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
