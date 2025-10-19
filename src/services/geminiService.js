import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../utils/logger.js';

export class GeminiService {
  constructor(apiKey, modelName = 'gemini-2.0-flash-exp') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
    this.conversationHistory = new Map();
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

  async analyzeServerData(trainingData, query) {
    try {
      const prompt = `You are analysing Discord server data to help answer support questions.

Server Training Data:
${JSON.stringify(trainingData, null, 2)}

Based on this data, please answer: ${query}

Focus on:
- Known bugs and their status
- Feature requests and their status
- Common issues users face
- Solutions that worked for similar problems`;

      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      Logger.error('Error analyzing server data:', error);
      return null;
    }
  }

  getHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  addToHistory(userId, role, content) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId);
    history.push({ role, parts: [{ text: content }] });

    if (history.length > 20) {
      this.conversationHistory.set(userId, history.slice(-20));
    }
  }

  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  clearAllHistory() {
    this.conversationHistory.clear();
  }
}
