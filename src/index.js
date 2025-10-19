import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config.js';
import { Logger } from './utils/logger.js';
import { GeminiService } from './services/geminiService.js';
import { DocumentationLoader } from './services/documentationLoader.js';
import { ServerIndexer } from './training/indexer.js';
import { InteractionHandler } from './commands/interactionHandler.js';
import { commandsJSON } from './commands/slashCommands.js';

class CAPlaygroundSupportBot {
  constructor() {
    validateConfig();

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.geminiService = new GeminiService(
      config.gemini.apiKey,
      config.gemini.model
    );

    this.documentationLoader = new DocumentationLoader(
      config.paths.documentation
    );

    this.serverIndexer = new ServerIndexer(
      this.client,
      config.paths.trainingData
    );

    this.interactionHandler = new InteractionHandler(
      this.geminiService,
      this.documentationLoader,
      this.serverIndexer
    );

    this.setupEventHandlers();
  }

  async deployCommands() {
    try {
      Logger.info(`Deploying ${commandsJSON.length} slash commands...`);
      const rest = new REST().setToken(config.discord.token);
      
      const data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commandsJSON }
      );

      Logger.info(`Successfully deployed ${data.length} slash commands`);
    } catch (error) {
      Logger.error('Error deploying commands:', error);
    }
  }

  setupEventHandlers() {
    this.client.once(Events.ClientReady, async () => {
      Logger.info(`Bot logged in as ${this.client.user.tag}`);
      Logger.info(`Serving ${this.client.guilds.cache.size} server(s)`);

      await this.deployCommands();

      await this.documentationLoader.loadDocumentation();

      for (const [guildId] of this.client.guilds.cache) {
        Logger.info(`Auto indexing server: ${guildId}`);
        try {
          const existingData = await this.serverIndexer.loadIndexData(guildId);
          
          await this.serverIndexer.indexServer(guildId, config.discord.indexChannelIds);
          
          const context = this.serverIndexer.getTrainingContext();
          Logger.info(`Indexed ${context.summary.totalChannels} channels, found ${context.summary.totalBugs} bugs, ${context.summary.totalFeatures} features, ${context.summary.totalSolutions} solutions`);
        } catch (error) {
          Logger.error(`Failed to index guild ${guildId}:`, error);
        }
      }

      // Set bot status
      this.client.user.setActivity('for @mentions | /help', { type: 'WATCHING' });
      
      Logger.info('Bot is ready to help!');
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.interactionHandler.handleInteraction(interaction);
      } catch (error) {
        Logger.error('Error handling interaction:', error);
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;

      try {
        if (message.mentions.has(this.client.user)) {
          await this.interactionHandler.handleMention(message);
          return;
        }

        if (config.discord.autoRespondChannelId && 
            message.channel.id === config.discord.autoRespondChannelId) {
          await this.interactionHandler.handleDM(message);
          return;
        }

        // Handle DMs
        if (message.channel.isDMBased()) {
          await this.interactionHandler.handleDM(message);
        }
      } catch (error) {
        Logger.error('Error handling message:', error);
      }
    });

    this.client.on(Events.GuildCreate, async (guild) => {
      Logger.info(`Joined new guild: ${guild.name} (${guild.id})`);
      
      try {
        await this.serverIndexer.indexServer(guild.id, config.discord.indexChannelIds);
        Logger.info(`Auto-indexed new guild: ${guild.name}`);
      } catch (error) {
        Logger.error(`Failed to auto-index guild ${guild.name}:`, error);
      }
    });

    this.client.on(Events.Error, (error) => {
      Logger.error('Discord client error:', error);
    });

    process.on('SIGINT', () => {
      Logger.info('Shutting down bot...');
      this.client.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      Logger.info('Shutting down bot...');
      this.client.destroy();
      process.exit(0);
    });
  }

  async start() {
    try {
      Logger.info('Starting CAPlayground Support Bot...');
      await this.client.login(config.discord.token);
    } catch (error) {
      Logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }
}

const bot = new CAPlaygroundSupportBot();
bot.start();
