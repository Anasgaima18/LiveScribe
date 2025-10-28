import OpenAI from 'openai';
import logger from '../config/logger.js';

// Lazy-load OpenAI client
let openai = null;
const getOpenAI = () => {
  if (!openai && process.env.OPENAI_API_KEY) {
    // Check if using OpenRouter (key starts with sk-or-v1)
    const isOpenRouter = process.env.OPENAI_API_KEY.startsWith('sk-or-v1');
    
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined,
      defaultHeaders: isOpenRouter ? {
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
        'X-Title': 'LiveKit Video Call'
      } : undefined
    });
  }
  return openai;
};

// List of threatening/abusive keywords (fallback detection)
const THREAT_KEYWORDS = {
  critical: [
    'kill', 'murder', 'bomb', 'terrorist', 'weapon', 'gun', 'shoot', 'death threat',
    'die', 'suicide', 'attack', 'violence', 'harm', 'hurt', 'destroy'
  ],
  high: [
    'threat', 'revenge', 'kidnap', 'hostage', 'torture', 'abuse', 'assault',
    'rape', 'molest', 'stalk'
  ],
  medium: [
    'hate', 'racist', 'discriminate', 'bully', 'harass', 'intimidate',
    'blackmail', 'extort', 'fraud', 'scam'
  ],
  low: [
    'stupid', 'idiot', 'fool', 'loser', 'worthless', 'pathetic'
  ]
};

/**
 * Analyze text for threats using OpenAI GPT-4
 * @param {string} text - The text to analyze
 * @returns {Promise<object>} - AI analysis result
 */
export const analyzeWithAI = async (text) => {
  try {
    const client = getOpenAI();
    
    if (!client) {
      logger.warn('OpenAI client not available, using keyword-based detection');
      return null;
    }

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_API_KEY?.startsWith('sk-or-v1') 
        ? 'openai/gpt-3.5-turbo' 
        : 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a content moderation AI. Analyze the following text for threats, harassment, hate speech, violence, or inappropriate content. 
          
Respond in JSON format with:
{
  "hasThreats": boolean,
  "severity": "critical" | "high" | "medium" | "low" | null,
  "categories": ["violence", "harassment", "hate_speech", "threats", "sexual_content", "self_harm"],
  "confidence": 0-100,
  "explanation": "brief explanation",
  "detectedIssues": ["list of specific issues found"]
}

Severity levels:
- critical: Immediate danger, death threats, terrorism, weapons, extreme violence
- high: Serious threats, harassment, stalking, assault, sexual abuse
- medium: Hate speech, discrimination, bullying, intimidation
- low: Mild insults, inappropriate language`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const aiResult = JSON.parse(response.choices[0].message.content);
    
    logger.info('AI threat analysis completed', {
      hasThreats: aiResult.hasThreats,
      severity: aiResult.severity,
      confidence: aiResult.confidence
    });

    return aiResult;
  } catch (error) {
    logger.error('AI threat analysis failed:', error);
    return null;
  }
};

/**
 * Scan text for threatening or inappropriate words (keyword-based fallback)
 * @param {string} text - The text to scan
 * @returns {object} - Detection result with matched words and severity
 */
export const keywordDetection = (text) => {
  const lowerText = text.toLowerCase();
  const detectedWords = [];
  let highestSeverity = null;

  // Check each severity level
  for (const [severity, keywords] of Object.entries(THREAT_KEYWORDS)) {
    for (const keyword of keywords) {
      // Use word boundary regex to match whole words
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(lowerText)) {
        detectedWords.push(keyword);
        if (!highestSeverity) {
          highestSeverity = severity;
        }
      }
    }
  }

  return {
    hasThreats: detectedWords.length > 0,
    matchedWords: [...new Set(detectedWords)], // Remove duplicates
    severity: highestSeverity,
    context: text,
    method: 'keyword'
  };
};

/**
 * Main threat detection function with AI + keyword fallback
 * @param {string} text - The text to scan
 * @returns {Promise<object>} - Detection result
 */
export const detectThreats = async (text) => {
  // Try AI-based detection first
  const aiResult = await analyzeWithAI(text);
  
  if (aiResult) {
    return {
      hasThreats: aiResult.hasThreats,
      severity: aiResult.severity,
      categories: aiResult.categories,
      confidence: aiResult.confidence,
      explanation: aiResult.explanation,
      detectedIssues: aiResult.detectedIssues,
      context: text,
      method: 'ai'
    };
  }

  // Fallback to keyword-based detection
  return keywordDetection(text);
};

/**
 * Get context around a matched word (for better understanding)
 * @param {string} text - Full text
 * @param {string} word - Matched word
 * @param {number} contextLength - Number of characters to include on each side
 * @returns {string} - Context snippet
 */
export const getWordContext = (text, word, contextLength = 50) => {
  const index = text.toLowerCase().indexOf(word.toLowerCase());
  if (index === -1) return text;

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + word.length + contextLength);

  let context = text.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
};
