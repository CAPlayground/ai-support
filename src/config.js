import dotenv from 'dotenv';

dotenv.config();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    autoRespondChannelId: '1410166503105368105', // AI support
    indexChannelIds: [
      '1410485504314577017', // App suggestions
      '1410166367172165733', // Support (threads)
      '1410166024770424873', // Announcements
      '1410166151400390717', // Developer logs
    ],
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.0-flash',
  },
  ai: {
    groundTruth: `
Official domain: https://caplayground.pages.dev
You are CAPlayground AI, a support/helping Discord bot for the CAPlayground Discord server.
CAPlayground is a Core Animation Wallpaper editor (CA Wallpaper Editor) that lets you make posterboard wallpapers for iOS 17+ devices like iPhones and iPads.
CAPlayground was created on the 24th of August, 2025.
You can create projects using the CAPlayground website. Projects are saved to your device or to the cloud (beta) using Google Drive.
enkei64 is the main developer. retronbv and squairdev are developers.
`,
  },
  paths: {
    documentation: './documentation',
    trainingData: './training-data',
  },
};

export function validateConfig() {
  const errors = [];

  if (!config.discord.token) {
    errors.push('DISCORD_TOKEN is not set in .env file');
  }

  if (!config.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is not set in .env file');
  }

  if (!config.gemini.apiKey) {
    errors.push('GEMINI_API_KEY is not set in .env file');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease check your .env file and ensure all required values are set.');
    process.exit(1);
  }
}
