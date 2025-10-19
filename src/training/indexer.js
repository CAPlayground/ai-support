import fs from 'fs/promises';
import path from 'path';
import { Client, GatewayIntentBits } from 'discord.js';
import { config, validateConfig } from '../config.js';
import { Logger } from '../utils/logger.js';

export class ServerIndexer {
  constructor(client, trainingDataPath) {
    this.client = client;
    this.trainingDataPath = trainingDataPath;
    this.indexData = {
      channels: {},
      bugs: [],
      features: [],
      commonIssues: [],
      solutions: [],
      lastIndexed: null,
    };
  }

  async indexServer(guildId, specificChannelIds = []) {
    try {
      Logger.info(`Starting server indexing for guild: ${guildId}`);
      
      const guild = await this.client.guilds.fetch(guildId);

      let channelsToProcess = [];
      
      if (specificChannelIds.length > 0) {
        Logger.info(`Fetching ${specificChannelIds.length} specific channels`);
        for (const channelId of specificChannelIds) {
          try {
            const channel = await guild.channels.fetch(channelId);
            if (channel && channel.viewable) {
              channelsToProcess.push(channel);
            }
          } catch (error) {
            Logger.warn(`Could not fetch channel ${channelId}: ${error.message}`);
          }
        }
      } else {
        channelsToProcess = Array.from(guild.channels.cache.filter(
          channel => channel.isTextBased() && channel.viewable
        ).values());
      }

      Logger.info(`Found ${channelsToProcess.length} channels to index`);

      for (const channel of channelsToProcess) {
        Logger.info(`Processing channel: #${channel.name} (Type: ${channel.type}, ID: ${channel.id})`);
        
        if (channel.type === 15) {
          Logger.info(`Channel #${channel.name} is a forum channel, fetching threads...`);
          try {
            const activeThreads = await channel.threads.fetchActive();
            const archivedThreads = await channel.threads.fetchArchived({ fetchAll: true });
            
            const allThreads = new Map([...activeThreads.threads, ...archivedThreads.threads]);
            Logger.info(`Found ${allThreads.size} threads in #${channel.name} (${activeThreads.threads.size} active, ${archivedThreads.threads.size} archived)`);
            
            for (const [threadId, thread] of allThreads) {
              await this.indexChannel(thread);
            }
          } catch (error) {
            Logger.error(`Error fetching threads from ${channel.name}:`, error.message);
          }
        } else if (channel.isTextBased()) {
          await this.indexChannel(channel);
        }
      }

      this.indexData.lastIndexed = new Date().toISOString();
      await this.saveIndexData(guildId);

      Logger.info('Server indexing completed');
      return this.indexData;
    } catch (error) {
      Logger.error('Error indexing server:', error);
      throw error;
    }
  }

  async indexChannel(channel) {
    try {
      Logger.info(`Indexing channel: #${channel.name}`);
      
      const existingChannel = this.indexData.channels[channel.id];
      let newestIndexedTimestamp = existingChannel?.latestTimestamp || 0;
      
      if (newestIndexedTimestamp > 0) {
        Logger.info(`Found existing index, latest timestamp: ${newestIndexedTimestamp}`);
      }
      
      const messages = existingChannel?.messages || [];
      let lastMessageId = null;
      let fetchedCount = 0;
      const maxMessages = 500;
      let newMessagesCount = 0;

      while (fetchedCount < maxMessages) {
        const options = { limit: 100 };
        if (lastMessageId) {
          options.before = lastMessageId;
        }

        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) break;

        let shouldStop = false;
        batch.forEach(msg => {
          if (msg.createdTimestamp <= newestIndexedTimestamp) {
            shouldStop = true;
            return;
          }
          
          messages.push({
            id: msg.id,
            content: msg.content,
            author: {
              id: msg.author.id,
              username: msg.author.username,
              bot: msg.author.bot,
            },
            timestamp: msg.createdTimestamp,
            date: new Date(msg.createdTimestamp).toISOString(),
            hasAttachments: msg.attachments.size > 0,
            reactions: msg.reactions.cache.map(r => ({
              emoji: r.emoji.name,
              count: r.count,
            })),
          });
          newMessagesCount++;
        });

        if (shouldStop) {
          Logger.info(`Reached previously indexed messages, stopping`);
          break;
        }

        lastMessageId = batch.last().id;
        fetchedCount += batch.size;

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      messages.sort((a, b) => b.timestamp - a.timestamp);
      
      if (messages.length > maxMessages) {
        messages.splice(maxMessages);
      }
      const latestTimestamp = messages.length > 0 
        ? Math.max(...messages.map(m => m.timestamp))
        : 0;

      this.indexData.channels[channel.id] = {
        name: channel.name,
        messageCount: messages.length,
        latestTimestamp: latestTimestamp,
        messages: messages,
      };

      this.analyzeMessages(channel.name, messages);

      if (newMessagesCount > 0) {
        Logger.info(`Indexed ${newMessagesCount} new messages from #${channel.name} (total: ${messages.length})`);
      } else {
        Logger.info(`No new messages in #${channel.name} (total: ${messages.length})`);
      }
    } catch (error) {
      Logger.error(`Error indexing channel ${channel.name}:`, error);
    }
  }

  analyzeMessages(channelName, messages) {
    const bugKeywords = ['bug', 'error', 'crash', 'broken', 'issue', 'problem', 'not working'];
    const featureKeywords = ['feature', 'request', 'suggestion', 'could you', 'would be nice', 'add'];
    const solutionKeywords = ['fixed', 'solved', 'working now', 'thanks', 'resolved'];

    messages.forEach(msg => {
      const content = msg.content.toLowerCase();

      if (bugKeywords.some(keyword => content.includes(keyword))) {
        this.indexData.bugs.push({
          channel: channelName,
          message: msg.content,
          author: msg.author.username,
          timestamp: msg.timestamp,
          id: msg.id,
        });
      }

      if (featureKeywords.some(keyword => content.includes(keyword))) {
        this.indexData.features.push({
          channel: channelName,
          message: msg.content,
          author: msg.author.username,
          timestamp: msg.timestamp,
          id: msg.id,
        });
      }

      if (solutionKeywords.some(keyword => content.includes(keyword))) {
        this.indexData.solutions.push({
          channel: channelName,
          message: msg.content,
          author: msg.author.username,
          timestamp: msg.timestamp,
          id: msg.id,
        });
      }
    });
  }

  async saveIndexData(guildId) {
    try {
      const filename = path.join(this.trainingDataPath, `server-index-${guildId}.json`);
      await fs.writeFile(filename, JSON.stringify(this.indexData, null, 2));
      Logger.info(`Index data saved to ${filename}`);
    } catch (error) {
      Logger.error('Error saving index data:', error);
    }
  }

  async loadIndexData(guildId) {
    try {
      const filename = path.join(this.trainingDataPath, `server-index-${guildId}.json`);
      const data = await fs.readFile(filename, 'utf-8');
      this.indexData = JSON.parse(data);
      Logger.info(`Loaded index data from ${filename}`);
      return this.indexData;
    } catch (error) {
      Logger.warn('No existing index data found, starting fresh');
      return null;
    }
  }

  getTrainingContext() {
    const sortByNewest = (arr) => arr.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
    
    const formatItem = (item) => ({
      ...item,
      timestamp: item.timestamp,
      date: new Date(item.timestamp).toISOString(),
      relativeTime: this.getRelativeTime(item.timestamp),
    });
    
    const getRecentChannelMessages = (channelName, limit = 5) => {
      const channel = Object.values(this.indexData.channels).find(ch => 
        ch.name.toLowerCase().includes(channelName.toLowerCase())
      );
      if (!channel || !channel.messages) return [];
      return channel.messages.slice(0, limit).map(msg => ({
        ...msg,
        channel: channel.name,
        relativeTime: this.getRelativeTime(msg.timestamp),
      }));
    };
    
    return {
      summary: {
        totalChannels: Object.keys(this.indexData.channels).length,
        totalBugs: this.indexData.bugs.length,
        totalFeatures: this.indexData.features.length,
        totalSolutions: this.indexData.solutions.length,
        lastIndexed: this.indexData.lastIndexed,
      },
      recentBugs: sortByNewest([...this.indexData.bugs]).map(formatItem),
      recentFeatures: sortByNewest([...this.indexData.features]).map(formatItem),
      recentSolutions: sortByNewest([...this.indexData.solutions]).map(formatItem),
      recentAnnouncements: getRecentChannelMessages('announcements', 5),
      recentDevLogs: getRecentChannelMessages('dev-logs', 5),
    };
  }

  getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', async () => {
    Logger.info(`Logged in as ${client.user.tag}`);
    
    const guildId = process.argv[2];
    if (!guildId) {
      Logger.error('Please provide a guild ID: npm run train <guild_id>');
      process.exit(1);
    }

    const indexer = new ServerIndexer(client, config.paths.trainingData);
    await indexer.indexServer(guildId);
    
    Logger.info('Indexing complete, shutting down...');
    process.exit(0);
  });

  client.login(config.discord.token);
}
