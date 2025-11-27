import React, { useState } from 'react';
import { UserInput, MistralDecision, ResolutionType } from '../types';
import { fetchOrderData, callMistralAgent, saveClaim } from '../services/mockBackend';
import { Button } from './ui/Button';
import { FileText, AlertCircle, CheckCircle, ShieldAlert, ServerCrash } from 'lucide-react';

export const ClaimForm: React.FC = () => {
  const [formData, setFormData] = useState<UserInput>({
    order_id: 0,
    customer_id: 0,
    issue_description: '',
    requested_resolution: 'not_sure'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MistralDecision | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    setSystemError(null);

    try {
      // 1. Fetch Order Data (Server Side)
      const validationPayload = await fetchOrderData(Number(formData.order_id));
      
      // 2. Call Mistral Agent (Server Side)
      const decision = await callMistralAgent(formData, validationPayload);
      
      // 3. Check for System/Capacity Errors
      if (decision.reason.includes("Service tier capacity exceeded") || 
          decision.reason.includes("Automated analysis unavailable")) {
        setSystemError("Our automated validation system is currently experiencing high traffic. Please try again in a few minutes or contact support directly if urgent.");
        return; // STOP: Do not save to history
      }

      // 4. Save result to history only if valid analysis
      await saveClaim(formData, decision);

      setResult(decision);
    } catch (error) {
      console.error("Error processing claim", error);
      setSystemError("An unexpected error occurred. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Submit a Dispute</h2>
            <p className="text-slate-500">Provide your order details for automated resolution.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Order ID</label>
              <input
                type="number"
                name="order_id"
                required
                className="w-full h-10 px-3 rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 1001"
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer ID / Phone</label>
              <input
                type="number"
                name="customer_id"
                required
                className="w-full h-10 px-3 rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. 501"
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Requested Resolution</label>
            <select
              name="requested_resolution"
              className="w-full h-10 px-3 rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={formData.requested_resolution}
              onChange={handleChange}
            >
              <option value={ResolutionType.NOT_SURE}>I'm not sure</option>
              <option value={ResolutionType.FULL_REFUND}>Full Refund</option>
              <option value={ResolutionType.PARTIAL_REFUND}>Partial Refund</option>
              <option value={ResolutionType.REPLACEMENT}>Replacement Item</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issue Description</label>
            <textarea
              name="issue_description"
              required
              rows={4}
              className="w-full p-3 rounded-md border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Please describe what went wrong..."
              onChange={handleChange}
            />
          </div>

          {systemError && (
            <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-start gap-3">
              <ServerCrash className="flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm">{systemError}</p>
            </div>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full">
            Submit Claim
          </Button>
        </form>
      </div>

      {result && (
        <div className={`rounded-xl shadow-lg border p-6 md:p-8 animate-fade-in ${
          result.status === 'approved' ? 'bg-emerald-50 border-emerald-200' :
          result.status === 'rejected' ? 'bg-red-50 border-red-200' :
          'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${
              result.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
              result.status === 'rejected' ? 'bg-red-100 text-red-600' :
              'bg-amber-100 text-amber-600'
            }`}>
              {result.status === 'approved' ? <CheckCircle size={32} /> :
               result.status === 'rejected' ? <ShieldAlert size={32} /> :
               <AlertCircle size={32} />}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2 capitalize text-slate-900">
                Decision: {result.status.replace('_', ' ')}
              </h3>
              <p className="text-slate-700 mb-4">{result.reason}</p>
              
              <div className="bg-white/60 rounded-lg p-4 text-sm space-y-2 border border-black/5">
                <div className="flex justify-between">
                  <span className="font-semibold">Next Steps:</span>
                  <span>{result.next_steps}</span>
                </div>
                {result.refund_amount && (
                   <div className="flex justify-between">
                   <span className="font-semibold">Refund Amount:</span>
                   <span>${result.refund_amount.toFixed(2)}</span>
                 </div>
                )}
                <div className="flex justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
                  <span>Confidence Score: {(result.confidence_score * 100).toFixed(0)}%</span>
                  <span>Source Connected: {result.data_source_connected ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};