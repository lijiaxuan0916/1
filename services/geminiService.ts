import { GoogleGenAI, Modality } from "@google/genai";

const API_KEY = process.env.API_KEY || ''; // Ensure this is set in your environment
const ai = new GoogleGenAI({ apiKey: API_KEY });

// System instructions for the text generation parts
const DYNED_SYSTEM_INSTRUCTION = `
You are the "DynEd Engine", an Interactive English Learning Application.
You are NOT a chatbot. You are a strict state machine.
Keep responses concise, professional, and encouraging.
Use emojis: 🎧 (Listen), 🗣️ (Speak), ⏺️ (Record), 📝 (Write), ✅ (Done).
When explaining grammar, be clear and use simple English unless asked for Chinese.
`;

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
    return "Error connecting to DynEd Engine. Please check your connection.";
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore, Puck, Charon, Fenrir, Zephyr
          },
        },
      },
    });

    // The response structure for TTS usually contains the inline data in candidates
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    return null;
  }
};

// Helper to get specific feedback (Hint, Explain, Correction)
export const getEducationalFeedback = async (
  type: 'hint' | 'explain' | 'correct_summary' | 'check_structure',
  context: string,
  userInput?: string
): Promise<string> => {
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
};

// Helper to extract a grammar point
export const extractGrammarPoint = async (text: string): Promise<string> => {
   const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Analyze this text: "${text}". Identify ONE key grammatical structure or useful phrase for a student to practice (e.g., "Used to...", "It takes..."). Return ONLY the structure name.`,
  });
  return response.text?.trim() || "Simple Past Tense";
};
