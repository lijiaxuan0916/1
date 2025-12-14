
export enum AppStep {
  INITIALIZATION = 0,
  GET_THE_GIST = 1,
  LISTEN_UNDERSTAND = 2,
  LISTEN_SPEAK = 3,
  RECORD_COMPARE = 4,
  SUMMARIZE_PERSONALIZE = 5,
  COMPLETED = 6
}

export enum MessageType {
  TEXT = 'text',
  AUDIO = 'audio',
  SYSTEM = 'system' // For state transitions/visual dividers
}

export enum Sender {
  BOT = 'bot',
  USER = 'user'
}

export interface Message {
  id: string;
  type: MessageType;
  sender: Sender;
  content: string; // Text content or base64 audio string (can be empty if fallback text is used)
  isPlaying?: boolean; // For UI state of audio messages
  label?: string; // Optional label for audio messages
  autoPlay?: boolean; // Automatically play audio when message appears
  textForSpeech?: string; // FALLBACK: If API fails, use this text with browser TTS
}

export interface LearningState {
  step: AppStep;
  rawScript: string;
  sentences: string[];
  currentSentenceIndex: number;
  grammarStructure?: string; // For Step 5
}

export interface GemniResponse {
  text?: string;
  audioBase64?: string;
}
