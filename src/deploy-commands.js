import { REST, Routes } from 'discord.js';
import { config, validateConfig } from './config.js';
import { commandsJSON } from './commands/slashCommands.js';
import { Logger } from './utils/logger.js';

validateConfig();

const rest = new REST({ version: '10' }).setToken(config.discord.token);

async function deployCommands() {
  try {
    Logger.info(`Started refreshing ${commandsJSON.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commandsJSON }
    );

    Logger.info(`Successfully reloaded ${data.length} application (/) commands.`);
    Logger.info('Commands registered:');
    data.forEach(cmd => Logger.info(`  /${cmd.name} - ${cmd.description}`));
  } catch (error) {
    Logger.error('Error deploying commands:', error);
    process.exit(1);
  }
}

deployCommands();
