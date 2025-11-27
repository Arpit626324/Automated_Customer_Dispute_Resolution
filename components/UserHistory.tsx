
import React, { useEffect, useState } from 'react';
import { ClaimRecord, ClaimStatus } from '../types';
import { getUserClaims, userRespondToOffer } from '../services/mockBackend';
import { Clock, CheckCircle, XCircle, AlertTriangle, ArrowRight, XCircle as XCircleIcon, Package, UserCheck, ThumbsUp, ThumbsDown } from 'lucide-react';

export const UserHistory: React.FC = () => {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Default demo user ID
  const SIMULATED_USER_ID = 501;

  const loadClaims = async () => {
    // setLoading(true); // Don't block UI on refresh
    try {
      const data = await getUserClaims(SIMULATED_USER_ID);
      setClaims(data);
      // Update selected claim reference if it's open
      if (selectedClaim) {
        const updated = data.find(c => String(c.claim_id) === String(selectedClaim.claim_id));
        if (updated) setSelectedClaim(updated);
      }
    } catch (e) {
      console.error("Failed to load claims", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
    // Refresh user history periodically so admin edits reflect quickly
    const interval = setInterval(loadClaims, 4000);
    return () => clearInterval(interval);
  }, []); // Remove selectedClaim dependency to avoid loops

  const handleUserAction = async (accepted: boolean) => {
    if (!selectedClaim) return;
    setActionLoading(true);
    try {
      await userRespondToOffer(selectedClaim.claim_id, accepted);
      await loadClaims();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusIcon = (status: ClaimStatus) => {
    switch (status) {
      case ClaimStatus.APPROVED: 
      case ClaimStatus.OFFER_ACCEPTED:
        return <CheckCircle className="text-emerald-500" size={18} />;
      case ClaimStatus.REJECTED: 
      case ClaimStatus.OFFER_REJECTED:
        return <XCircle className="text-red-500" size={18} />;
      case ClaimStatus.ESCALATE: return <AlertTriangle className="text-amber-500" size={18} />;
      case ClaimStatus.WAITING_USER_ACTION: return <UserCheck className="text-blue-500" size={18} />;
      default: return <Clock className="text-slate-400" size={18} />;
    }
  };

  const getStatusStyle = (status: ClaimStatus) => {
    switch (status) {
      case ClaimStatus.APPROVED: 
      case ClaimStatus.OFFER_ACCEPTED:
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case ClaimStatus.REJECTED: 
      case ClaimStatus.OFFER_REJECTED:
        return 'bg-red-50 text-red-700 border-red-100';
      case ClaimStatus.ESCALATE: return 'bg-amber-50 text-amber-700 border-amber-100';
      case ClaimStatus.WAITING_USER_ACTION: return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">My Claim History</h2>
        </div>
      </div>

      {loading && claims.length === 0 ? (
        <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-slate-200">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : claims.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center text-slate-500">
          <Clock size={48} className="mb-4 text-slate-300" />
          <h3 className="text-lg font-medium text-slate-700">No claims yet</h3>
          <p>Claims you submit via Form or Chat will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="px-6 py-4 font-semibold w-24">Order</th>
                  <th className="px-6 py-4 font-semibold">Items</th>
                  <th className="px-6 py-4 font-semibold w-24">Order Amt</th>
                  <th className="px-6 py-4 font-semibold w-24">Refund</th>
                  <th className="px-6 py-4 font-semibold flex-1">AI Reason</th>
                  <th className="px-6 py-4 font-semibold w-32">Status</th>
                  <th className="px-6 py-4 font-semibold w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {claims.map((claim) => (
                  <tr key={claim.claim_id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="text-slate-900 font-medium">#{claim.order_id}</div>
                      <div className="text-xs text-slate-400 font-mono">{String(claim.claim_id).substring(0,6)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2 max-w-[200px]">
                        <Package size={16} className="text-slate-400 mt-0.5 flex-shrink-0"/>
                        <span className="text-sm text-slate-600 truncate" title={claim.items_detail}>
                          {claim.items_detail || 'Loading...'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {claim.order_amount ? `$${claim.order_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      {claim.ai_decision?.refund_amount ? `$${claim.ai_decision.refund_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs">
                       <div className="truncate" title={claim.ai_decision?.reason || claim.issue_description}>
                         {claim.ai_decision?.reason || <span className="text-slate-400 italic">Processing...</span>}
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyle(claim.status)}`}>
                        {getStatusIcon(claim.status)}
                        <span className="capitalize">{claim.status.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedClaim(claim)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                      >
                        View <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedClaim && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-full ${getStatusStyle(selectedClaim.status)}`}>
                   {getStatusIcon(selectedClaim.status)}
                 </div>
                 <div>
                    <h3 className="text-xl font-bold text-slate-800">Claim Details</h3>
                    <p className="text-xs text-slate-500 font-mono">ID: {selectedClaim.claim_id}</p>
                 </div>
              </div>
              <button onClick={() => setSelectedClaim(null)} className="text-slate-400 hover:text-slate-600">
                <XCircleIcon size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              
              {/* ACTION REQUIRED BANNER */}
              {selectedClaim.status === ClaimStatus.WAITING_USER_ACTION && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-pulse-slow">
                   <h4 className="text-blue-800 font-bold flex items-center gap-2 mb-2">
                     <UserCheck size={20} /> Action Required
                   </h4>
                   <p className="text-blue-700 text-sm mb-4">
                     The admin has proposed a new resolution for your claim. Please review the offer below and accept or reject it.
                   </p>
                   <div className="flex gap-3">
                      <button 
                        onClick={() => handleUserAction(true)}
                        disabled={actionLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors"
                      >
                        {actionLoading ? "..." : <><ThumbsUp size={16} /> Accept Offer</>}
                      </button>
                      <button 
                         onClick={() => handleUserAction(false)}
                         disabled={actionLoading}
                         className="flex-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 py-2 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors"
                      >
                         {actionLoading ? "..." : <><ThumbsDown size={16} /> Reject Offer</>}
                      </button>
                   </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6 text-sm">
                 <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Order ID</span>
                    <span className="font-semibold text-slate-900 text-lg">#{selectedClaim.order_id}</span>
                 </div>
                 <div>
                    <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Order Amount</span>
                    <span className="text-slate-700 font-medium">
                       {selectedClaim.order_amount ? `$${selectedClaim.order_amount.toFixed(2)}` : 'N/A'}
                    </span>
                 </div>
                 <div className="col-span-2">
                    <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Items in Order</span>
                    <p className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                      {selectedClaim.items_detail || 'Item details unavailable'}
                    </p>
                 </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <span className="block text-xs font-bold text-slate-400 uppercase mb-2">Issue Description</span>
                  <p className="text-slate-700 text-sm">{selectedClaim.issue_description}</p>
              </div>

              {selectedClaim.ai_decision && (
                <div className="border-t border-slate-100 pt-4">
                   <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                     <div className={`w-2 h-2 rounded-full ${selectedClaim.status === ClaimStatus.WAITING_USER_ACTION ? 'bg-blue-500' : 'bg-slate-400'}`}></div>
                     Resolution Details
                   </h4>
                   <div className="space-y-3">
                      <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2">
                         <span className="text-slate-500">Outcome</span>
                         <span className={`font-bold capitalize ${
                           selectedClaim.status === 'approved' || selectedClaim.status === 'offer_accepted' ? 'text-emerald-600' : 
                           selectedClaim.status === 'rejected' || selectedClaim.status === 'offer_rejected' ? 'text-red-600' : 
                           selectedClaim.status === 'waiting_user_action' ? 'text-blue-600' : 'text-amber-600'
                         }`}>{selectedClaim.status.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2">
                         <span className="text-slate-500">Note / Reason</span>
                         <span className="text-slate-900 text-right max-w-[60%]">{selectedClaim.ai_decision.reason}</span>
                      </div>
                      {selectedClaim.ai_decision.refund_amount !== null && (
                        <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2">
                           <span className="text-slate-500">Refund Amount</span>
                           <span className="font-bold text-slate-900">${selectedClaim.ai_decision.refund_amount.toFixed(2)}</span>
                        </div>
                      )}
                       {selectedClaim.ai_decision.resolution_type && (
                        <div className="flex justify-between text-sm border-b border-dashed border-slate-200 pb-2">
                           <span className="text-slate-500">Resolution Type</span>
                           <span className="font-bold text-slate-900 capitalize">{selectedClaim.ai_decision.resolution_type.replace(/_/g,' ')}</span>
                        </div>
                      )}
                      <div className="bg-slate-100 p-3 rounded text-sm text-slate-600 italic">
                         <span className="font-bold mr-2 not-italic">System Note:</span>
                         {selectedClaim.ai_decision.next_steps}
                      </div>
                   </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedClaim(null)}
                className="px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
