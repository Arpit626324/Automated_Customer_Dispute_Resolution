
import React, { useState, useRef, useEffect } from 'react';
import { UserInput, MistralDecision, ResolutionType } from '../types';
import { fetchOrderData, callMistralAgent, saveClaim } from '../services/mockBackend';
import { Send, Bot, User, Loader2, RefreshCcw } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  type?: 'text' | 'json';
  jsonContent?: MistralDecision;
}

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: 'Hello, I am ClaimFlowAi. How can I help you today? Please tell me about your order issue (e.g., "I want a refund for Order 12753 because it arrived damaged").' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  
  const [formData, setFormData] = useState<UserInput>({
    order_id: 0,
    customer_id: 501, // Default to demo user to streamline UX
    issue_description: '',
    requested_resolution: ResolutionType.NOT_SURE
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // --- Robust NLP Extraction Logic ---
  const extractDataFromText = (text: string, currentData: UserInput): UserInput => {
    const newData = { ...currentData };
    const lower = text.toLowerCase();
    
    // 1. Improved ID Extraction
    const numbers = text.match(/\d+/g);
    if (numbers) {
       // Look for order mention specifically
       const orderMatch = text.match(/(?:order|ord|#)\s*(?:id|#)?\s*[:]?\s*(\d+)/i);
       if (orderMatch) {
         newData.order_id = parseInt(orderMatch[1]);
       } else {
         // Fallback: Pick the longest number as order ID if not set
         const sortedNumbers = [...numbers].sort((a, b) => b.length - a.length);
         if (!newData.order_id && sortedNumbers[0]) newData.order_id = parseInt(sortedNumbers[0]);
       }
       
       // Customer ID detection if multiple numbers or specific mention
       const custMatch = text.match(/(?:customer|user|my)\s*(?:id|#)?\s*[:]?\s*(\d+)/i);
       if (custMatch) {
         newData.customer_id = parseInt(custMatch[1]);
       }
    }

    // 2. Resolution Extraction
    if (lower.includes('refund') || lower.includes('money back')) {
        newData.requested_resolution = ResolutionType.FULL_REFUND;
        if (lower.includes('partial') || lower.includes('half')) newData.requested_resolution = ResolutionType.PARTIAL_REFUND;
    } else if (lower.includes('replace') || lower.includes('exchange') || lower.includes('new one')) {
        newData.requested_resolution = ResolutionType.REPLACEMENT;
    }

    // 3. Issue Extraction
    const issueKeywords = ['damaged', 'broken', 'missing', 'lost', 'wrong', 'defect', 'problem', 'not arrived', 'late', 'bad', 'spoiled'];
    const hasIssue = issueKeywords.some(k => lower.includes(k));
    
    if (hasIssue || text.length > 20) {
        // If it's a long sentence and contains keywords, treat it as the issue
        if (newData.issue_description.length < 5) {
            newData.issue_description = text;
        } else if (!newData.issue_description.toLowerCase().includes(lower)) {
            newData.issue_description += " " + text;
        }
    }

    return newData;
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const currentInput = inputText;
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: currentInput };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    
    const updatedData = extractDataFromText(currentInput, formData);
    setFormData(updatedData);

    // Give it a tiny delay to feel more natural
    setTimeout(() => {
        determineNextStep(updatedData);
    }, 600);
  };

  const determineNextStep = (data: UserInput) => {
    if (!data.order_id) {
        addBotMessage("Please provide your Order ID so I can look up your details.");
        return;
    }
    
    if (!data.issue_description || data.issue_description.length < 5) {
        addBotMessage("I've found your order. Could you briefly explain what's wrong with it?");
        return;
    }

    // If resolution isn't clear, ask but provide options
    if (data.requested_resolution === ResolutionType.NOT_SURE) {
        addBotMessage("Understood. What would you like as a resolution? A full refund, partial refund, or replacement?");
        return;
    }

    // All set? Process!
    if (!isProcessing) {
        processFinalSubmission(data);
    }
  };

  const addBotMessage = (text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'bot', text }]);
  };

  const processFinalSubmission = async (data: UserInput) => {
    setIsProcessing(true);
    addBotMessage(`Perfect. I have all the details for Order #${data.order_id}. I'm analyzing the transaction and your request now...`);
    
    try {
      const validation = await fetchOrderData(Number(data.order_id));
      const decision = await callMistralAgent(data, validation);
      await saveClaim(data, decision);

      setMessages(prev => [...prev, {
        id: Date.now().toString(), sender: 'bot', text: `Analysis Complete. Decision: ${decision.status.toUpperCase()}`,
        type: 'json', jsonContent: decision
      }]);
      
      setTimeout(() => {
        addBotMessage(decision.next_steps);
        setIsDone(true);
        setIsProcessing(false);
      }, 1000);
      
    } catch (e) {
      addBotMessage("I'm sorry, I'm having trouble connecting to my decision engine. Please try again in a moment.");
      setIsProcessing(false);
    }
  };

  const resetChat = () => {
      setMessages([{ id: '1', sender: 'bot', text: 'Hello, I am ClaimFlowAi. How can I help you today?' }]);
      setFormData({ order_id: 0, customer_id: 501, issue_description: '', requested_resolution: ResolutionType.NOT_SURE });
      setIsDone(false);
      setIsProcessing(false);
  };

  return (
    <div className="max-w-2xl mx-auto h-[600px] flex flex-col bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-full"><Bot size={20} /></div>
            <div>
              <h3 className="font-semibold">ClaimFlowAi Assistant</h3>
              <p className="text-xs text-slate-300">Smart Dispute Resolution</p>
            </div>
        </div>
        {isDone && (
            <button onClick={resetChat} className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
                <RefreshCcw size={12} /> New Chat
            </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-2`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'}`}>
                {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-3 rounded-2xl text-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'}`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.type === 'json' && msg.jsonContent && (
                  <div className="mt-3 p-3 bg-slate-900 text-green-400 font-mono text-xs rounded overflow-x-auto border border-slate-800">
                    <div className="flex justify-between border-b border-slate-700 pb-2 mb-2">
                        <span className="text-slate-400">Status:</span>
                        <span className="font-bold uppercase text-white">{msg.jsonContent.status}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-700 pb-2 mb-2">
                        <span className="text-slate-400">Refund:</span>
                        <span className="text-white">{msg.jsonContent.refund_amount ? `$${msg.jsonContent.refund_amount}` : 'N/A'}</span>
                    </div>
                    <div className="mb-2">
                         <span className="text-slate-400 block mb-1">Reason:</span>
                         <span className="text-slate-300">{msg.jsonContent.reason}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isProcessing && (
           <div className="flex justify-start">
             <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none shadow-sm">
               <Loader2 className="animate-spin text-blue-500" size={16} />
               <span className="text-sm text-slate-500">Processing with Mistral AI...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 h-10 px-4 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            placeholder={isDone ? "Chat closed." : "Tell me about your order..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isProcessing && !isDone && handleSend()}
            disabled={isProcessing || isDone}
          />
          <button 
            onClick={handleSend}
            disabled={isProcessing || isDone || !inputText.trim()}
            className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
