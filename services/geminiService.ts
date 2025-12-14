
import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || ''; // Ensure this is set in your environment
const ai = new GoogleGenAI({ apiKey: API_KEY });

// In-memory cache for audio: Map<TextContent, Base64AudioString>
const audioCache = new Map<string, string>();

// System instructions for the text generation parts
const DYNED_SYSTEM_INSTRUCTION = `
You are the "DynEd Engine", an Interactive English Learning Application.
You are NOT a chatbot. You are a strict state machine.
Keep responses concise, professional, and encouraging.
Use emojis: 🎧 (Listen), 🗣️ (Speak), ⏺️ (Record), 📝 (Write), ✅ (Done).
When explaining grammar, be clear and use simple English unless asked for Chinese.
`;

// Helper to detect quota errors
const handleApiError = (error: any, defaultMsg: string): string => {
    const errorMsg = error?.message || error?.toString() || '';
    if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('exhausted')) {
        return "⚠️ API Quota Exceeded (429). Please wait 1 minute and try again. (免费版API额度耗尽，请稍等一分钟)";
    }
    return defaultMsg;
};

export const generateTextResponse = async (
  prompt: string, 
  history: string[]
): Promise<string> => {
  try {
    const model = "gemini-2.5-flash"; 
    // Construct a context-aware prompt
    const contents = `
      Current Conversation History:
      ${history.join('\n')}
      
      User Input: ${prompt}
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        systemInstruction: DYNED_SYSTEM_INSTRUCTION,
      }
    });

    return response.text || "I apologize, I didn't catch that. Could you repeat?";
  } catch (error) {
    console.error("Gemini Text Error:", error);
    return handleApiError(error, "Error connecting to DynEd Engine. Please check your connection.");
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  // 1. Check Cache First
  const trimmedText = text.trim();
  if (audioCache.has(trimmedText)) {
      // console.log("Serving audio from cache");
      return audioCache.get(trimmedText) || null;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: trimmedText }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore is a good balanced voice
          },
        },
      },
    });

    // The response structure for TTS usually contains the inline data in candidates
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
        // 2. Save to Cache
        audioCache.set(trimmedText, base64Audio);
        return base64Audio;
    }
    return null;

  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    // If it's a quota error, we want to throw it so the UI shows it, 
    // rather than just returning null and staying silent.
    const msg = error?.message || '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
         throw new Error("QUOTA_EXCEEDED");
    }
    throw error;
  }
};

// Helper to get specific feedback (Hint, Explain, Correction)
export const getEducationalFeedback = async (
  type: 'hint' | 'explain' | 'correct_summary' | 'check_structure',
  context: string,
  userInput?: string
): Promise<string> => {
  try {
    let prompt = "";
    if (type === 'hint') prompt = `Provide a simple English synonym or contextual clue for this sentence: "${context}". Do not translate.`;
    if (type === 'explain') prompt = `Explain the grammar and meaning of this sentence in simple terms (you may use Chinese if complex): "${context}"`;
    if (type === 'correct_summary') prompt = `The user summarized the text. Original text: "${context}". User summary: "${userInput}". Correct their grammar politely and rate their understanding out of 10.`;
    if (type === 'check_structure') prompt = `The required structure was "${context}". The user wrote: "${userInput}". Did they use it correctly? If yes, praise them. If no, correct them.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { systemInstruction: DYNED_SYSTEM_INSTRUCTION }
    });
    return response.text || "";
  } catch (error) {
    console.error("Feedback Error:", error);
    return handleApiError(error, "Unable to get feedback at this time.");
  }
};

// Helper to extract a grammar point
export const extractGrammarPoint = async (text: string): Promise<string> => {
   try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analyze this text: "${text}". Identify ONE key grammatical structure or useful phrase for a student to practice (e.g., "Used to...", "It takes..."). Return ONLY the structure name.`,
    });
    return response.text?.trim() || "Simple Past Tense";
   } catch (error) {
     return "Daily Expression";
   }
};
