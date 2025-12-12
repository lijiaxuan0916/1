
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppStep, Message, MessageType, Sender, LearningState } from './types';
import { generateSpeech, getEducationalFeedback, extractGrammarPoint } from './services/geminiService';
import AudioPlayer from './components/AudioPlayer';
import AudioRecorder from './components/AudioRecorder';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Core Learning State
  const [learningState, setLearningState] = useState<LearningState>({
    step: AppStep.INITIALIZATION,
    rawScript: '',
    sentences: [],
    currentSentenceIndex: 0,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, learningState.step, isLoading]);

  // Initial Welcome
  useEffect(() => {
    addMessage({
      type: MessageType.TEXT,
      sender: Sender.BOT,
      content: "**DynEd Learning Engine Loaded.** 🟢\nPlease paste the English text you want to master today."
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() + Math.random() }]);
  };

  const processInput = async () => {
    if (!input.trim()) return;

    const userText = input.trim();
    setInput('');
    addMessage({ type: MessageType.TEXT, sender: Sender.USER, content: userText });

    await runStepLogic(userText);
  };

  // The State Machine Engine
  const runStepLogic = async (userInput: string) => {
    setIsLoading(true);

    try {
      // STATE 0: INIT -> STATE 1
      if (learningState.step === AppStep.INITIALIZATION) {
        // Simple heuristic to split sentences: periods, exclamation, question marks followed by space
        const sentences = userInput.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map(s => s.trim()) || [userInput];
        
        setLearningState(prev => ({
          ...prev,
          step: AppStep.GET_THE_GIST,
          rawScript: userInput,
          sentences: sentences,
          currentSentenceIndex: 0
        }));

        addMessage({ type: MessageType.SYSTEM, sender: Sender.BOT, content: "--- 1. Get the Gist (泛听) ---" });
        
        // Generate Audio for full text
        const audioData = await generateSpeech(userInput);
        if (audioData) {
          addMessage({ 
            type: MessageType.AUDIO, 
            sender: Sender.BOT, 
            content: audioData,
            autoPlay: true,
            label: "Full Story"
          });
        }
        
        addMessage({ 
          type: MessageType.TEXT, 
          sender: Sender.BOT, 
          content: "🎧 Please listen to the full text above. Do not read detailedly yet.\n\nQuestion: After listening, please tell me in one sentence: What is the main idea?" 
        });
      }

      // STATE 1: GIST -> STATE 2
      else if (learningState.step === AppStep.GET_THE_GIST) {
        const feedback = await getEducationalFeedback('correct_summary', learningState.rawScript, userInput);
        addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: feedback });
        
        // Transition to Step 2
        setLearningState(prev => ({ ...prev, step: AppStep.LISTEN_UNDERSTAND, currentSentenceIndex: 0 }));
        
        addMessage({ type: MessageType.SYSTEM, sender: Sender.BOT, content: "--- 2. Listen & Understand (精听) ---" });
        await startSentenceLoop(0); // Pass index 0 explicitly
      }

      // STATE 2: UNDERSTAND LOOP
      else if (learningState.step === AppStep.LISTEN_UNDERSTAND) {
        const currentSentence = learningState.sentences[learningState.currentSentenceIndex];

        // Process commands for current sentence
        if (userInput.toLowerCase() === 'yes' || userInput.toLowerCase() === 'y') {
            // Next sentence
            const nextIndex = learningState.currentSentenceIndex + 1;
            if (nextIndex < learningState.sentences.length) {
                setLearningState(prev => ({ ...prev, currentSentenceIndex: nextIndex }));
                await startSentenceLoop(nextIndex);
            } else {
                // Done with Step 2, move to Step 3
                setLearningState(prev => ({ ...prev, step: AppStep.LISTEN_SPEAK, currentSentenceIndex: 0 }));
                addMessage({ type: MessageType.SYSTEM, sender: Sender.BOT, content: "--- 3. Listen & Speak (跟读/Shadowing) ---" });
                await startShadowingLoop(0);
            }
        } else if (userInput.toLowerCase() === 'hint') {
             const hint = await getEducationalFeedback('hint', currentSentence);
             addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: `💡 Hint: ${hint}` });
        } else if (userInput.toLowerCase() === 'explain') {
             const explanation = await getEducationalFeedback('explain', currentSentence);
             addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: `📖 Explanation: ${explanation}` });
        } else {
             addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "Please reply with 'Yes' to continue, 'Hint', or 'Explain'." });
        }
      }

      // STATE 3: SHADOWING LOOP
      else if (learningState.step === AppStep.LISTEN_SPEAK) {
        if (userInput.toLowerCase() === '/next' || userInput.toLowerCase() === 'next') {
             const nextIndex = learningState.currentSentenceIndex + 1;
             if (nextIndex < learningState.sentences.length) {
                 setLearningState(prev => ({ ...prev, currentSentenceIndex: nextIndex }));
                 await startShadowingLoop(nextIndex);
             } else {
                 // Done with Step 3, move to Step 4
                 setLearningState(prev => ({ ...prev, step: AppStep.RECORD_COMPARE, currentSentenceIndex: 0 }));
                 addMessage({ type: MessageType.SYSTEM, sender: Sender.BOT, content: "--- 4. Record & Compare (录音对比) ---" });
                 await startRecordLoop(0);
             }
        } else {
            addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "Practice speaking the sentence above. Type '/next' when you are satisfied with your pronunciation." });
        }
      }

      // STATE 4: RECORD LOOP
      else if (learningState.step === AppStep.RECORD_COMPARE) {
         // User gives self reflection for the current sentence
         addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "Great reflection. Moving to next sentence." });
         
         const nextIndex = learningState.currentSentenceIndex + 1;
         if (nextIndex < learningState.sentences.length) {
            setLearningState(prev => ({ ...prev, currentSentenceIndex: nextIndex }));
            await startRecordLoop(nextIndex);
         } else {
             // Move to Step 5
             setLearningState(prev => ({ ...prev, step: AppStep.SUMMARIZE_PERSONALIZE }));
             addMessage({ type: MessageType.SYSTEM, sender: Sender.BOT, content: "--- 5. Summarize & Personalize (活用) ---" });
             
             addMessage({ 
                 type: MessageType.TEXT, 
                 sender: Sender.BOT, 
                 content: "📝 Step 5 Part A: Please summarize the entire story in English in your own words (without looking at original text)." 
             });
         }
      }

      // STATE 5: SUMMARIZE -> PERSONALIZE
      else if (learningState.step === AppStep.SUMMARIZE_PERSONALIZE) {
          if (!learningState.grammarStructure) {
              // We just got the summary, correct it, then ask for personalization
              const feedback = await getEducationalFeedback('correct_summary', learningState.rawScript, userInput);
              addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: feedback });

              // Prepare Part B
              const structure = await extractGrammarPoint(learningState.rawScript);
              setLearningState(prev => ({ ...prev, grammarStructure: structure }));
              
              addMessage({ 
                  type: MessageType.TEXT, 
                  sender: Sender.BOT, 
                  content: `Step 5 Part B: Personalize.\n\nGrammar Focus: **${structure}**\n\nTask: Use this structure to describe a fact about YOUR own life, family, or studies.` 
              });
          } else {
              // We got the personalization sentence
              const feedback = await getEducationalFeedback('check_structure', learningState.grammarStructure, userInput);
              addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: feedback });
              addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "🎉 Excellent work! You have completed the DynEd 5-Step Cycle for this text. Paste a new text to start again." });
              
              // Reset
              setLearningState({
                  step: AppStep.INITIALIZATION,
                  rawScript: '',
                  sentences: [],
                  currentSentenceIndex: 0
              });
          }
      }

    } catch (err) {
      console.error(err);
      addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "An error occurred interacting with the engine." });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: Step 2 Loop Display
  const startSentenceLoop = async (index: number) => {
    const sentence = learningState.sentences[index];
    addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: `Sentence ${index + 1}/${learningState.sentences.length}:\n\n**"${sentence}"**` });
    
    // Generate Audio for the specific sentence
    const audioData = await generateSpeech(sentence);
    if (audioData) {
        addMessage({ 
          type: MessageType.AUDIO, 
          sender: Sender.BOT, 
          content: audioData, 
          autoPlay: true 
        });
    }

    addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "Do you understand this sentence? (Yes / Hint / Explain)" });
  };

  // Helper: Step 3 Loop Display (With Audio)
  const startShadowingLoop = async (index: number) => {
    const sentence = learningState.sentences[index];
    addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: `Shadowing ${index + 1}/${learningState.sentences.length}:\n\n**"${sentence}"**` });
    
    const audioData = await generateSpeech(sentence);
    if (audioData) {
        addMessage({ 
          type: MessageType.AUDIO, 
          sender: Sender.BOT, 
          content: audioData, 
          autoPlay: true 
        });
    }
    
    addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "🗣️ Listen, then Speak. Repeat 3 times. Type '/next' when done." });
  };

  // Helper: Step 4 Loop Display
  const startRecordLoop = async (index: number) => {
      const sentence = learningState.sentences[index];
      
      addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: `Recording ${index + 1}/${learningState.sentences.length}:\n\n**"${sentence}"**` });
      
      // Generate TTS for it
      const audioData = await generateSpeech(sentence);
      if (audioData) {
        addMessage({ type: MessageType.AUDIO, sender: Sender.BOT, content: audioData, label: "Model Audio", autoPlay: false });
      }

      // The UI will detect we are in RECORD_COMPARE and render the recorder
  };

  const handleQuickReply = (text: string) => {
      setInput(text);
      // Optional: auto-submit could be enabled here
      // processInput(); 
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="bg-blue-700 text-white p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center font-bold shadow-sm">D</div>
            <h1 className="text-lg font-semibold tracking-wide">DynEd Engine</h1>
        </div>
        <div className="flex items-center space-x-3">
             {isLoading && <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>}
             <div className="text-xs bg-blue-800 px-2 py-1 rounded border border-blue-600">
                Step {learningState.step} / 5
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-hide scroll-smooth"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === Sender.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.type === MessageType.SYSTEM ? 'w-full flex justify-center' : ''}`}>
              
              {msg.type === MessageType.SYSTEM && (
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider my-4 text-center border-b border-slate-200 pb-2 w-full">
                    {msg.content}
                </div>
              )}

              {msg.type === MessageType.TEXT && (
                <div className={`p-3 rounded-2xl shadow-sm whitespace-pre-wrap leading-relaxed ${
                  msg.sender === Sender.USER 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                }`}>
                  {msg.content}
                </div>
              )}

              {msg.type === MessageType.AUDIO && (
                 <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm rounded-tl-none animate-fade-in-up">
                     <AudioPlayer 
                        base64Audio={msg.sender === Sender.BOT ? msg.content : undefined} 
                        audioUrl={msg.sender === Sender.USER ? msg.content : undefined}
                        label={msg.label || (msg.sender === Sender.BOT ? "Teacher" : "You")} 
                        autoPlay={msg.autoPlay}
                     />
                 </div>
              )}

            </div>
          </div>
        ))}
        
        {/* Contextual UI for Step 4: Show Recorder when bot last spoke and didn't ask for reflection yet */}
        {learningState.step === AppStep.RECORD_COMPARE && 
         messages.length > 0 && 
         messages[messages.length-1].sender === Sender.BOT && 
         !messages[messages.length-1].content.includes("Self-Evaluation") && (
            <div className="flex justify-center my-4 animate-fade-in">
                <AudioRecorder 
                    key={learningState.currentSentenceIndex}
                    onRecordingComplete={(blob) => {
                     const url = URL.createObjectURL(blob);
                     // Add User Audio Bubble so they can listen
                     addMessage({ type: MessageType.AUDIO, sender: Sender.USER, content: url });
                     // Add Prompt for reflection
                     addMessage({ type: MessageType.TEXT, sender: Sender.BOT, content: "Self-Evaluation: On a scale of 1-10, how close was your intonation? Type your reflection." });
                }} />
            </div>
        )}

        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 text-xs px-4 py-2 rounded-full animate-pulse flex items-center space-x-2">
                    <span>Thinking</span>
                    <span className="flex space-x-1">
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                    </span>
                </div>
            </div>
        )}
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 p-4">
        
        {/* Quick Actions based on Step */}
        {learningState.step === AppStep.LISTEN_UNDERSTAND && !isLoading && (
            <div className="flex space-x-2 mb-3 justify-center">
                <button onClick={() => handleQuickReply('Yes')} className="px-5 py-2 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium hover:bg-green-100 transition-colors">Yes</button>
                <button onClick={() => handleQuickReply('Hint')} className="px-5 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full text-sm font-medium hover:bg-yellow-100 transition-colors">Hint</button>
                <button onClick={() => handleQuickReply('Explain')} className="px-5 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-sm font-medium hover:bg-purple-100 transition-colors">Explain</button>
            </div>
        )}
        
        {learningState.step === AppStep.LISTEN_SPEAK && !isLoading && (
            <div className="flex space-x-2 mb-3 justify-center">
                <button onClick={() => handleQuickReply('/next')} className="px-6 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-sm font-medium hover:bg-blue-100 transition-colors">Next Sentence →</button>
            </div>
        )}

        <div className="flex items-end space-x-2">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        processInput();
                    }
                }}
                placeholder={learningState.step === AppStep.INITIALIZATION ? "Paste English text here..." : "Type your answer..."}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none max-h-32 min-h-[52px] outline-none text-slate-800 placeholder-slate-400"
                rows={1}
            />
            <button 
                onClick={processInput}
                disabled={!input.trim() || isLoading}
                className="w-14 h-[52px] bg-blue-600 rounded-2xl flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
            >
                <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default App;
