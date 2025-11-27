import React, { useState, useRef, useEffect } from 'react';
import { UserInput, MistralDecision, ResolutionType } from '../types';
import { fetchOrderData, callMistralAgent, saveClaim } from '../services/mockBackend';
import { Send, Bot, User, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  type?: 'text' | 'json';
  jsonContent?: MistralDecision;
}

enum ChatStep {
  ORDER_ID,
  CUSTOMER_ID,
  ISSUE,
  RESOLUTION,
  PROCESSING,
  DONE
}

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: 'Hello, I am ARC-DRX. I can help resolve your order dispute quickly. First, what is your Order ID?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [step, setStep] = useState<ChatStep>(ChatStep.ORDER_ID);
  const [formData, setFormData] = useState<UserInput>({
    order_id: 0,
    customer_id: 0,
    issue_description: '',
    requested_resolution: ResolutionType.NOT_SURE
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: inputText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    
    // Process input based on current step
    processInput(inputText, step);
  };

  const addBotMessage = (text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'bot', text }]);
  };

  const processInput = async (input: string, currentStep: ChatStep) => {
    let nextStep = currentStep;
    const newData = { ...formData };

    switch (currentStep) {
      case ChatStep.ORDER_ID:
        const oid = parseInt(input.replace(/\D/g, ''));
        if (isNaN(oid)) {
          setTimeout(() => addBotMessage("I didn't catch a valid number. Please enter just the numeric Order ID."), 500);
          return;
        }
        newData.order_id = oid;
        nextStep = ChatStep.CUSTOMER_ID;
        setTimeout(() => addBotMessage("Thanks. Now, please provide your Customer ID."), 500);
        break;

      case ChatStep.CUSTOMER_ID:
        const cid = parseInt(input.replace(/\D/g, ''));
        if (isNaN(cid)) {
          setTimeout(() => addBotMessage("Please enter a numeric Customer ID."), 500);
          return;
        }
        newData.customer_id = cid;
        nextStep = ChatStep.ISSUE;
        setTimeout(() => addBotMessage("Got it. Briefly describe the issue with your order."), 500);
        break;

      case ChatStep.ISSUE:
        newData.issue_description = input;
        nextStep = ChatStep.RESOLUTION;
        setTimeout(() => addBotMessage("And finally, would you like a full refund, partial refund, or replacement?"), 500);
        break;

      case ChatStep.RESOLUTION:
        const lower = input.toLowerCase();
        if (lower.includes('full')) newData.requested_resolution = ResolutionType.FULL_REFUND;
        else if (lower.includes('partial')) newData.requested_resolution = ResolutionType.PARTIAL_REFUND;
        else if (lower.includes('place') || lower.includes('new')) newData.requested_resolution = ResolutionType.REPLACEMENT;
        else newData.requested_resolution = ResolutionType.NOT_SURE;
        
        nextStep = ChatStep.PROCESSING;
        setTimeout(() => processFinalSubmission(newData), 500);
        break;
    }

    setFormData(newData);
    setStep(nextStep);
  };

  const processFinalSubmission = async (data: UserInput) => {
    addBotMessage("Processing your request with our database and ARC-DRX agent...");
    
    try {
      const validation = await fetchOrderData(Number(data.order_id));
      const decision = await callMistralAgent(data, validation);
      
      // Check for System Capacity Error
      if (decision.reason.includes("Service tier capacity exceeded") || 
          decision.reason.includes("Automated analysis unavailable")) {
        
        addBotMessage("I apologize, but my decision engine is currently experiencing extremely high traffic and cannot process your request at this moment.");
        addBotMessage("Please try again in 5-10 minutes. Your claim has NOT been saved.");
        setStep(ChatStep.DONE);
        return;
      }

      // Save to backend only if successful
      await saveClaim(data, decision);

      const responseMsg: Message = {
        id: Date.now().toString(),
        sender: 'bot',
        text: `Analysis Complete. Decision: ${decision.status.toUpperCase()}`,
        type: 'json',
        jsonContent: decision
      };
      setMessages(prev => [...prev, responseMsg]);
      
      setTimeout(() => {
        addBotMessage(decision.next_steps);
        setStep(ChatStep.DONE);
      }, 1000);
      
    } catch (e) {
      addBotMessage("Sorry, I encountered an error connecting to the decision engine.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-[600px] flex flex-col bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center gap-3">
        <div className="bg-blue-500 p-2 rounded-full">
          <Bot size={20} />
        </div>
        <div>
          <h3 className="font-semibold">ARC-DRX Assistant</h3>
          <p className="text-xs text-slate-300">Autonomous Resolution Agent</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-2`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'
              }`}>
                {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              <div className={`p-3 rounded-2xl text-sm ${
                msg.sender === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'
              }`}>
                <p>{msg.text}</p>
                {msg.type === 'json' && msg.jsonContent && (
                  <div className="mt-3 p-3 bg-slate-900 text-green-400 font-mono text-xs rounded overflow-x-auto">
                    <pre>{JSON.stringify(msg.jsonContent, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {step === ChatStep.PROCESSING && (
           <div className="flex justify-start">
             <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none">
               <Loader2 className="animate-spin text-blue-500" size={16} />
               <span className="text-sm text-slate-500">Analyzing claim data...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 h-10 px-4 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={step === ChatStep.DONE ? "Session ended. Refresh to start over." : "Type your answer..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={step === ChatStep.PROCESSING || step === ChatStep.DONE}
          />
          <button 
            onClick={handleSend}
            disabled={step === ChatStep.PROCESSING || step === ChatStep.DONE}
            className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};