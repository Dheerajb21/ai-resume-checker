import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, MessageSquare, BookOpen, Clock, FileText, 
  ChevronRight, CheckCircle, AlertCircle, Download, 
  PlayCircle, Video, File, ArrowRight, Loader2, Send, Code
} from 'lucide-react';

export default function App() {
  const [phase, setPhase] = useState('INPUT'); // INPUT, LOADING_CONTEXT, ASSESSING, GENERATING_PLAN, DASHBOARD
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');
  
  // API Key from .env
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const [jdText, setJdText] = useState('');
  const [pdfData, setPdfData] = useState(null); // base64
  
  // Assessment Data
  const [candidateName, setCandidateName] = useState('');
  const [candidateBackground, setCandidateBackground] = useState('');
  const [requiredSkills, setRequiredSkills] = useState([]);
  
  // Chat Data
  const [conversation, setConversation] = useState([]); // [{ role: 'user'|'model', text: '', parts: [] }]
  const [userInput, setUserInput] = useState('');
  
  // MCQ State
  const [currentMCQ, setCurrentMCQ] = useState(null);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [skillScores, setSkillScores] = useState({});

  const extractMCQ = (text) => {
    try {
      const match = text.match(/\{[\s\S]*?"correct"\s*:\s*"[A-D]"[\s\S]*?\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      if (!parsed.question || !parsed.options || !parsed.correct) return null;
      return parsed;
    } catch (e) {
      console.error("MCQ parse failed:", e);
      return null;
    }
  };
  
  // Plan Data
  const [planData, setPlanData] = useState(null);
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  const callGemini = async (contents, systemInstruction = "") => {
    if (!apiKey) throw new Error("API Key is missing.");
    const apiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash-lite-preview';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;
    
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2500 }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error ${response.status}: ${errText}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  };

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError("Please upload a valid PDF file.");
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target.result.split(',')[1];
      setPdfData(base64String);
    };
    reader.readAsDataURL(file);
  };

  const startAssessment = async () => {
    if (!apiKey) {
      setError("API Key is missing from .env file.");
      return;
    }
    if (!jdText || !pdfData) {
      setError("Job Description and PDF are all required.");
      return;
    }
    setError('');
    setPhase('LOADING_CONTEXT');
    setLoadingText('Analyzing Job Description and Resume...');
    
    try {
      const pdfPart = {
        inline_data: {
          mime_type: "application/pdf",
          data: pdfData
        }
      };

      const contents = [{
        role: "user",
        parts: [
          pdfPart,
          { text: `Here is the Job Description:\n${jdText}\n\nExtract required skills from the JD and candidate background from the resume. Respond ONLY in JSON format: { "requiredSkills": ["skill1", "skill2"], "candidateBackground": "brief summary", "name": "candidate name" }. No markdown backticks.` }
        ]
      }];

      const responseText = await callGemini(contents);
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      setRequiredSkills(parsed.requiredSkills || []);
      setCandidateBackground(parsed.candidateBackground || '');
      setCandidateName(parsed.name || 'Candidate');
      
      setPhase('ASSESSING');
      
      // Initialize first chat
      const initContents = [
        {
          role: "user",
          parts: [
            pdfPart,
            { text: `JD: ${jdText}\n\nCandidate: ${parsed.name || 'Candidate'}\nSkills to assess: ${(parsed.requiredSkills || []).join(", ")}\n\nBegin the assessment. Ask the first question.` }
          ]
        }
      ];
      
      const systemInstruction = `You are an expert technical interviewer assessing a candidate for a role.
For each required skill, generate exactly ONE multiple choice question with 4 options (A, B, C, D).
Format EVERY question strictly as JSON like this:

{
  "skill": "React",
  "question": "What does useEffect with an empty dependency array do?",
  "options": {
    "A": "Runs on every render",
    "B": "Runs only once after the first render",
    "C": "Runs before the component mounts",
    "D": "Runs only when props change"
  },
  "correct": "B"
}

Ask one MCQ per skill. After the candidate selects an answer, give a brief 1-line explanation, then move to the next skill's MCQ.
After all skills are covered, say exactly: "ASSESSMENT_COMPLETE"
Always respond with the JSON block first, then explanation text (if answering a previous question).`;
      
      const firstAIMessage = await callGemini(initContents, systemInstruction);
      
      const mcq = extractMCQ(firstAIMessage);
      if (mcq) setCurrentMCQ(mcq);
      
      setConversation([
        { role: 'user', parts: initContents[0].parts },
        { role: 'model', parts: [{ text: firstAIMessage }] }
      ]);
      
    } catch (err) {
      setError(err.message);
      setPhase('INPUT');
    }
  };

  const sendChatMessage = async (textToSend = userInput, conv = conversation, skipPush = false) => {
    let updatedConv = conv;
    
    if (!skipPush) {
      if (!textToSend || !textToSend.trim()) return;
      const newMsg = { role: 'user', parts: [{ text: textToSend }] };
      updatedConv = [...conv, newMsg];
      setConversation(updatedConv);
      setUserInput('');
    }
    
    setLoadingText('Thinking...');
    
    try {
      const apiContents = updatedConv.map(c => ({
        role: c.role,
        parts: c.parts.map(p => {
          if (p.inline_data) return { inline_data: p.inline_data };
          return { text: p.text };
        })
      }));
      
      const systemInstruction = `You are an expert technical interviewer assessing a candidate for a role.
For each required skill, generate exactly ONE multiple choice question with 4 options (A, B, C, D).
Format EVERY question strictly as JSON like this:

{
  "skill": "React",
  "question": "What does useEffect with an empty dependency array do?",
  "options": {
    "A": "Runs on every render",
    "B": "Runs only once after the first render",
    "C": "Runs before the component mounts",
    "D": "Runs only when props change"
  },
  "correct": "B"
}

Ask one MCQ per skill. After the candidate selects an answer, give a brief 1-line explanation, then move to the next skill's MCQ.
After all skills are covered, say exactly: "ASSESSMENT_COMPLETE"
Always respond with the JSON block first, then explanation text (if answering a previous question).`;
      
      const responseText = await callGemini(apiContents, systemInstruction);
      
      if (responseText.includes('ASSESSMENT_COMPLETE')) {
        setConversation(prev => [...prev, { role: 'model', parts: [{ text: responseText.replace('ASSESSMENT_COMPLETE', '').trim() || 'Assessment complete. Generating your learning plan...' }] }]);
        generatePlan(updatedConv); 
      } else {
        const mcq = extractMCQ(responseText);
        if (mcq) setCurrentMCQ(mcq);
        setConversation(prev => [...prev, { role: 'model', parts: [{ text: responseText }] }]);
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingText('');
    }
  };

  const handleOptionSelect = (selectedKey) => {
    if (!currentMCQ) return;
    const isCorrect = selectedKey === currentMCQ.correct;
    
    setSkillScores(prev => ({
      ...prev,
      [currentMCQ.skill]: isCorrect ? 10 : 3
    }));

    const userText = `My answer is ${selectedKey}. ${currentMCQ.options[selectedKey]}`;
    const newMsg = { role: 'user', parts: [{ text: userText }] };
    const updatedConv = [...conversation, newMsg];
    
    setConversation(updatedConv);
    setAnswerFeedback({ selected: selectedKey, correct: currentMCQ.correct });
    
    setTimeout(() => {
      setAnswerFeedback(null);
      setCurrentMCQ(null);
      sendChatMessage(null, updatedConv, true);
    }, 800);
  };

  const generatePlan = async (history) => {
    setPhase('GENERATING_PLAN');
    setLoadingText('Generating your personalized learning plan...');
    
    try {
      const planPrompt = `
Based on the entire assessment conversation above, generate a detailed personalised learning plan.
Respond ONLY with valid JSON (no backticks, no explanation):
{
  "candidateName": "",
  "targetRole": "",
  "overallScore": 0,
  "skills": [
    {
      "name": "",
      "score": 0,
      "level": "Beginner|Intermediate|Advanced",
      "gap": "",
      "resources": [
        { "title": "", "url": "", "type": "article|course|video", "duration": "" }
      ],
      "weeklyPlan": [
        { "week": 1, "task": "", "hours": 0 }
      ]
    }
  ],
  "totalEstimatedTime": "",
  "priorityOrder": []
}
`;
      const apiContents = history.map(c => ({
        role: c.role,
        parts: c.parts.map(p => {
          if (p.inline_data) return { inline_data: p.inline_data };
          return { text: p.text };
        })
      }));
      
      apiContents.push({ role: 'user', parts: [{ text: planPrompt }] });
      
      const responseText = await callGemini(apiContents);
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedPlan = JSON.parse(cleanJson);
      
      setPlanData(parsedPlan);
      setPhase('DASHBOARD');
      
    } catch (err) {
      setError("Failed to generate plan: " + err.message);
      setPhase('ASSESSING'); // fallback
    }
  };

  const exportJson = () => {
    if (!planData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(planData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "learning_plan.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const getScoreColor = (score) => {
    if (score >= 7) return 'bg-green-500';
    if (score >= 4) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  const getScoreText = (score) => {
    if (score >= 7) return 'text-green-500';
    if (score >= 4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const renderResourceIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'course': return <PlayCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-blue-500/30">
      
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              AI Resume Checker
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* ERROR ALERT */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* PHASE 1: INPUT */}
        {phase === 'INPUT' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-extrabold mb-4">Validate Real Proficiency</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">
                Paste a Job Description and upload a candidate's resume. Our AI agent will conduct a conversational technical interview to evaluate true skills and generate a customized learning roadmap.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* JD Panel */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-lg">Job Description</h3>
                </div>
                <textarea 
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm text-slate-300"
                />
              </div>

              {/* Resume Panel */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <File className="w-5 h-5 text-blue-400" />
                  <h3 className="font-semibold text-lg">Candidate Resume</h3>
                </div>
                
                <div className="flex-1 bg-slate-900 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group hover:border-blue-500 transition-colors">
                  <input 
                    type="file" 
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  {pdfData ? (
                    <div className="text-center">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                      <p className="text-green-400 font-medium">Resume Uploaded Successfully</p>
                      <p className="text-slate-500 text-sm mt-1">Click to replace</p>
                    </div>
                  ) : (
                    <div className="text-center px-6">
                      <Upload className="w-12 h-12 text-slate-500 mx-auto mb-4 group-hover:text-blue-400 transition-colors" />
                      <p className="font-medium text-slate-300">Drop PDF here or click to browse</p>
                      <p className="text-slate-500 text-sm mt-2">Maximum file size 5MB</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button 
                onClick={startAssessment}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-3 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(59,130,246,0.4)]"
              >
                Start Assessment <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* LOADING SCREENS */}
        {(phase === 'LOADING_CONTEXT' || phase === 'GENERATING_PLAN') && (
          <div className="flex flex-col items-center justify-center py-32 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 rounded-full blur-xl bg-blue-500/20 animate-pulse"></div>
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative" />
            </div>
            <h2 className="text-2xl font-bold mt-8 mb-2">{loadingText}</h2>
            <p className="text-slate-400 text-center max-w-md">
              {phase === 'LOADING_CONTEXT' ? 
                "We are extracting skills and preparing the interview room..." : 
                "Analyzing responses to craft a bespoke progression roadmap..."}
            </p>
          </div>
        )}

        {/* PHASE 2: ASSESSING */}
        {phase === 'ASSESSING' && (
          <div className="max-w-4xl mx-auto flex flex-col h-[80vh] bg-slate-800/50 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500">
            {/* Chat Header */}
            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  Interviewing {candidateName}
                </h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-48 bg-slate-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(Math.min(requiredSkills.length, Math.floor((conversation.length - 1) / 2) + 1) / Math.max(1, requiredSkills.length)) * 100}%` }}></div>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Question {Math.min(requiredSkills.length, Math.floor((conversation.length - 1) / 2) + 1)} of {requiredSkills.length} {currentMCQ ? `[${currentMCQ.skill}]` : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                  Live Assessment
                </span>
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {conversation.map((msg, idx) => {
                // Skip the first user message as it's just context setup
                if (idx === 0 && msg.role === 'user') return null;
                
                // Exclude inline data parts from display
                let textParts = msg.parts.filter(p => p.text).map(p => p.text).join('\n');
                
                const isAI = msg.role === 'model';
                if (isAI) {
                  const mcqMatch = extractMCQ(textParts);
                  textParts = textParts.replace(/\{[\s\S]*?"correct"\s*:\s*"[A-D]"[\s\S]*?\}/, '').trim();
                  if (mcqMatch) {
                    textParts = textParts ? `${textParts}\n\n**${mcqMatch.skill}:** ${mcqMatch.question}` : `**${mcqMatch.skill}:** ${mcqMatch.question}`;
                  }
                }
                
                if (!textParts) return null;

                return (
                  <div key={idx} className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-2xl p-4 ${
                      isAI 
                        ? 'bg-slate-700/50 border border-slate-600 text-slate-200' 
                        : 'bg-blue-600 text-white'
                    }`}>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{textParts}</p>
                    </div>
                  </div>
                );
              })}
              {loadingText === 'Thinking...' && (
                <div className="flex justify-start">
                  <div className="bg-slate-700/50 border border-slate-600 rounded-2xl p-4 flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-slate-800 border-t border-slate-700">
              {currentMCQ ? (
                <div className="mt-4 p-4 rounded-xl bg-slate-800 border border-blue-500/40">
                  <p className="text-white font-semibold text-base mb-4 leading-relaxed">
                    🧠 {currentMCQ.question}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                  {Object.entries(currentMCQ.options).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => handleOptionSelect(key)}
                      disabled={!!answerFeedback}
                      className={`p-3 rounded-lg text-left text-sm border transition-all
                        ${answerFeedback 
                          ? answerFeedback.selected === key 
                            ? answerFeedback.selected === answerFeedback.correct 
                              ? "bg-green-600 border-green-400" 
                              : "bg-red-600 border-red-400" 
                            : key === answerFeedback.correct 
                              ? "bg-green-800 border-green-600" 
                              : "bg-slate-700 border-slate-600 opacity-50"
                          : "bg-slate-700 hover:bg-blue-600 border-slate-600 hover:border-blue-500"
                        }`}
                    >
                      <span className="font-bold text-blue-400">{key}.</span> {val}
                    </button>
                  ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      placeholder="Type your answer..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none h-14 text-sm"
                      disabled={loadingText === 'Thinking...'}
                    />
                    <button 
                      onClick={() => sendChatMessage()}
                      disabled={loadingText === 'Thinking...' || !userInput.trim()}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-xl flex items-center justify-center transition-colors"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center">Press Enter to send, Shift+Enter for new line.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* PHASE 3: DASHBOARD */}
        {phase === 'DASHBOARD' && planData && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-8">
            
            {/* Header Card */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-4">
                    <CheckCircle className="w-4 h-4" /> Assessment Complete
                  </div>
                  <h2 className="text-4xl font-extrabold mb-2">{planData.candidateName}</h2>
                  <p className="text-xl text-slate-400">Target Role: <span className="text-slate-200">{planData.targetRole}</span></p>
                  
                  <div className="flex items-center gap-6 mt-6">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-5 h-5 text-slate-500" />
                      <span>{planData.totalEstimatedTime} est. time</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <BookOpen className="w-5 h-5 text-slate-500" />
                      <span>{planData.skills.length} skills analyzed</span>
                    </div>
                  </div>
                </div>

                {/* Score Ring */}
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#1e293b" strokeWidth="8" />
                    <circle 
                      cx="50" cy="50" r="45" fill="none" 
                      stroke={planData.overallScore >= 70 ? '#22c55e' : planData.overallScore >= 40 ? '#eab308' : '#ef4444'} 
                      strokeWidth="8" 
                      strokeDasharray={`${planData.overallScore * 2.827} 282.7`} 
                      strokeLinecap="round" 
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-4xl font-black">{planData.overallScore}</span>
                    <span className="text-sm text-slate-400 block">/100</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex justify-end">
              <button 
                onClick={exportJson}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Export JSON
              </button>
            </div>

            {/* Skill Cards Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {planData.skills.map((skill, idx) => (
                <div key={idx} className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-lg hover:border-slate-600 transition-colors group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{skill.name}</h3>
                      <p className={`text-sm font-medium mt-1 ${getScoreText(skill.score)}`}>{skill.level}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center font-bold text-lg border border-slate-700">
                      {skill.score}
                    </div>
                  </div>
                  
                  {/* Score Bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2 mb-4 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${getScoreColor(skill.score)}`} 
                      style={{ width: `${(skill.score / 10) * 100}%` }}
                    ></div>
                  </div>
                  
                  <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-800">
                    <p className="text-sm text-slate-300 leading-relaxed"><span className="font-semibold text-slate-400">Gap:</span> {skill.gap}</p>
                  </div>

                  {skill.resources && skill.resources.length > 0 && (
                    <details className="mt-4 group/details">
                      <summary className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 cursor-pointer hover:text-blue-400 transition-colors list-none flex items-center justify-between">
                        Recommended Resources
                        <ChevronRight className="w-4 h-4 transform group-open/details:rotate-90 transition-transform" />
                      </summary>
                      <ul className="space-y-2 mt-2">
                        {skill.resources.map((res, rIdx) => (
                          <li key={rIdx}>
                            <a href={res.url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 hover:bg-slate-700 border border-slate-800 hover:border-slate-600 transition-all text-sm group/link">
                              <span className={`p-2 rounded-lg ${res.type === 'video' ? 'bg-red-500/10 text-red-400' : res.type === 'course' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                {renderResourceIcon(res.type)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-200 truncate group-hover/link:text-blue-400 transition-colors">{res.title}</p>
                                <p className="text-xs text-slate-500">{res.duration}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-600 group-hover/link:text-blue-400" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* Weekly Timeline */}
            <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-xl mt-8">
              <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                <Clock className="w-6 h-6 text-blue-500" /> Action Plan
              </h3>
              
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-blue-500 before:via-slate-700 before:to-transparent">
                {planData.skills.flatMap(s => (s.weeklyPlan || []).map(wp => ({ ...wp, skillName: s.name })))
                  .sort((a, b) => a.week - b.week)
                  .map((task, idx, arr) => (
                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 bg-blue-500 text-white font-bold text-sm shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10">
                      W{task.week}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-900 p-5 rounded-2xl border border-slate-700 shadow-sm hover:border-blue-500/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-400">{task.skillName}</span>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-md">{task.hours} hrs</span>
                      </div>
                      <p className="text-sm text-slate-300 mt-2">{task.task}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
