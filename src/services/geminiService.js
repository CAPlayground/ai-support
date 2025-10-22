import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../utils/logger.js';

export class GeminiService {
  constructor(apiKey, modelName = 'gemini-2.0-flash-exp') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
    this.conversationHistory = new Map();
    this.historyTTLms = 30 * 60 * 1000; // 30 minutes
  }

  async generateResponse(prompt, userId = null, systemContext = '') {
    try {
      const chat = this.model.startChat({
        history: userId ? this.getHistory(userId) : [],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      });

      const fullPrompt = systemContext 
        ? `${systemContext}\n\nUser Question: ${prompt}`
        : prompt;

      const result = await chat.sendMessage(fullPrompt);
      const response = result.response.text();

      if (userId) {
        this.addToHistory(userId, 'user', prompt);
        this.addToHistory(userId, 'model', response);
      }

      return response;
    } catch (error) {
      Logger.error('Gemini API error:', error);
      throw error;
    }
  }

  async analyzeServerData(trainingData, query, groundTruth = '') {
    try {
      const groundTruthBlock = groundTruth
        ? `Authoritative Facts (Ground Truth):\n${groundTruth}\n\nInstructions:\n- If any data (including messages, summaries, or prior answers) conflicts with the Authoritative Facts, the Authoritative Facts take precedence.\n- Do not speculate beyond these facts; if you are unsure or information is missing, say you don't know.\n- Only include information explicitly supported by either the Authoritative Facts or the user's question.\n\n`
        : '';

      const prompt = `${groundTruthBlock}You are analysing Discord server data to help answer support questions.

Server Training Data. This data is useful when users want to know bugs, issues, new features, announcements, dev logs, and server rules:
${JSON.stringify(trainingData, null, 2)}

Based on this data, please answer: ${query}

Focus on:
- Known bugs and their status whether they are fixed or not. DO NOT provide any information unless asked about a similar bug or the exact same bug.
- Feature requests and their status whether they are added or not. DO NOT provide any information unless asked about a similar feature request or the exact same feature request.
- Common issues users face, only if asked for it.
- Solutions that worked for similar problems, only if asked for it.

If asked for it, provide a brief summary (one or two sentences each) of what the following training channels currently contain based on the data above:
- Announcements - Server announcements (for Discord server), or CAPlayground.
- Dev logs - Developer logs for CAPlayground, such as new features that are out or coming soon, beta features, or showcases. Read the message to know what dev log it is.
- Rules - Server rules (for Discord server), or CAPlayground.
- Support threads - Support threads for CAPlayground, bug reports or issues users are encountering.
- App suggestion threads - App suggestion threads (for Discord server), or CAPlayground.`;

      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      Logger.error('Error analyzing server data:', error);
      return null;
    }
  }

  getHistory(userId) {
    const now = Date.now();
    const ttl = this.historyTTLms;
    const history = this.conversationHistory.get(userId) || [];
    const filtered = history.filter(h => typeof h.timestamp === 'number' ? (now - h.timestamp) <= ttl : true);
    if (filtered.length !== history.length) {
      this.conversationHistory.set(userId, filtered);
    }
    return filtered.map(({ role, parts }) => ({ role, parts }));
  }

  addToHistory(userId, role, content) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const now = Date.now();
    const ttl = this.historyTTLms;
    const history = this.conversationHistory.get(userId);
    history.push({ role, parts: [{ text: content }], timestamp: now });
    const pruned = history.filter(h => typeof h.timestamp === 'number' ? (now - h.timestamp) <= ttl : true);
    const capped = pruned.length > 20 ? pruned.slice(-20) : pruned;
    this.conversationHistory.set(userId, capped);
  }

  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  clearAllHistory() {
    this.conversationHistory.clear();
  }
}
