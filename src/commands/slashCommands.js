import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the support bot a question')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Your question')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('docs')
    .setDescription('Show documentation summary'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show training data statistics'),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear your conversation history'),

  new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Reload documentation files (enkei64 only)'),

  new SlashCommandBuilder()
    .setName('index')
    .setDescription('Re-index server messages for training (enkei64 only)'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help information about the bot'),
];

export const commandsJSON = commands.map(command => command.toJSON());
