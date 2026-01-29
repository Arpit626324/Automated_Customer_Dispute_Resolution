
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle, CheckCircle, Clock, FileText, ArrowUpRight, Search, XCircle, Check, X, Package, DollarSign, Edit, Send, UserCheck } from 'lucide-react';
import { getClaims, updateClaimStatus } from '../services/mockBackend';
import { ClaimRecord, ClaimStatus, ResolutionType } from '../types';

export const AdminDashboard: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'auto_resolved' | 'pending' | 'high_risk'>('all');
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, auto: 0, pending: 0, risk: 0 });
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Manual Resolution State
  const [isEditing, setIsEditing] = useState(false);
  const [manualResolution, setManualResolution] = useState<ResolutionType>(ResolutionType.FULL_REFUND);
  // Allow empty string for "Partial Refund" blank box requirement
  const [manualRefundAmount, setManualRefundAmount] = useState<number | ''>(0);
  const [adminNotes, setAdminNotes] = useState('');

  const loadData = async () => {
    // getClaims now handles local storage fallback automatically
    const allClaims = await getClaims();
    setClaims(allClaims);
    
    setStats({
      total: allClaims.length,
      auto: allClaims.filter(c => c.status === 'approved' || c.status === 'rejected' || c.status === 'offer_accepted' || c.status === 'offer_rejected').length,
      pending: allClaims.filter(c => c.status === 'pending' || c.status === 'escalate' || c.status === 'waiting_user_action').length,
      risk: allClaims.filter(c => c.risk_level === 'high').length
    });
  };

  useEffect(() => {
    loadData();
    // Poll for updates every 3 seconds to ensure real-time feel
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Initialize form when a claim is selected
  useEffect(() => {
    if (selectedClaim) {
      const needsAction = selectedClaim.status === 'pending' || selectedClaim.status === 'escalate';
      setIsEditing(needsAction); // Auto-edit if pending, otherwise view-only first
      setAdminNotes('');
      
      if (selectedClaim.ai_decision) {
        // Pre-fill from existing decision
        const existingType = selectedClaim.ai_decision.resolution_type as unknown as ResolutionType;
        setManualResolution(Object.values(ResolutionType).includes(existingType) ? existingType : ResolutionType.FULL_REFUND);
        setManualRefundAmount(selectedClaim.ai_decision.refund_amount || 0);
      } else {
         // Default for new manual review
         setManualResolution(ResolutionType.FULL_REFUND);
         setManualRefundAmount(selectedClaim.order_amount || 0);
      }
    }
  }, [selectedClaim]);

  // AUTOMATED REFUND AMOUNT LOGIC based on Resolution Type
  useEffect(() => {
    if (selectedClaim && isEditing) {
      switch (manualResolution) {
        case ResolutionType.FULL_REFUND:
          // Auto-fill total amount
          setManualRefundAmount(selectedClaim.order_amount || 0);
          break;
        case ResolutionType.NONE:
        case ResolutionType.REPLACEMENT:
          // Auto-fill 0 for replacement or rejection
          setManualRefundAmount(0);
          break;
        case ResolutionType.PARTIAL_REFUND:
          // Clear box for manual entry
          setManualRefundAmount('');
          break;
        default:
          break;
      }
    }
  }, [manualResolution, isEditing, selectedClaim]);

  const handleManualAction = async (status: ClaimStatus) => {
    if (!selectedClaim) return;
    setActionLoading(true);
    
    // If Admin is Editing and chooses to Approve/Offer, we set status to WAITING_USER_ACTION 
    // to allow user to accept/reject, unless they specifically chose 'REJECTED' (handled by param)
    let finalStatus = status;
    
    if (isEditing && status === ClaimStatus.APPROVED) {
      // If manual override, send as offer
      finalStatus = ClaimStatus.WAITING_USER_ACTION;
    }

    try {
      await updateClaimStatus(
        selectedClaim.claim_id, 
        finalStatus, 
        manualResolution, 
        (finalStatus === ClaimStatus.APPROVED || finalStatus === ClaimStatus.WAITING_USER_ACTION) ? Number(manualRefundAmount) : 0,
        adminNotes
      );
      await loadData(); // Refresh immediately
    } catch (e) {
      console.error("Action failed", e);
    } finally {
      setActionLoading(false);
      setSelectedClaim(null);
      setIsEditing(false);
    }
  };

  const getFilteredClaims = () => {
    switch (activeFilter) {
      case 'auto_resolved': return claims.filter(c => c.status === 'approved' || c.status === 'rejected' || c.status === 'offer_accepted' || c.status === 'offer_rejected');
      case 'pending': return claims.filter(c => c.status === 'pending' || c.status === 'escalate' || c.status === 'waiting_user_action');
      case 'high_risk': return claims.filter(c => c.risk_level === 'high');
      default: return claims;
    }
  };

  const filteredList = getFilteredClaims();

  // Dynamic Chart Data Generation (Last 7 Days)
  const generateChartData = () => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const today = new Date();
      const data = [];
      
      // Go back 6 days + today = 7 days total
      for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dayName = days[d.getDay()];
          
          // Filter claims for this specific day
          const count = claims.filter(c => {
              const cDate = new Date(c.created_at);
              return cDate.getDate() === d.getDate() && 
                     cDate.getMonth() === d.getMonth() && 
                     cDate.getFullYear() === d.getFullYear();
          }).length;
          
          data.push({ name: dayName, claims: count });
      }
      return data;
  };

  const CHART_DATA = generateChartData();

  const Card = ({ title, value, subtext, icon, type, active }: any) => (
    <div 
      onClick={() => setActiveFilter(type)}
      className={`p-6 rounded-xl border shadow-sm cursor-pointer transition-all ${
        active 
        ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' 
        : 'bg-white border-slate-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}>{title}</h3>
        {icon}
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className={`text-xs mt-1 ${active ? 'text-blue-600' : 'text-slate-400'}`}>{subtext}</p>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Admin Dashboard</h2>
           <p className="text-slate-500">Real-time dispute monitoring</p>
        </div>
        <div className="flex gap-2">
            <div className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
               System Active
            </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          title="Total Claims" 
          value={stats.total} 
          subtext="All records"
          type="all"
          active={activeFilter === 'all'}
          icon={<FileText className={activeFilter === 'all' ? "text-blue-600" : "text-blue-500"} size={20} />} 
        />
        <Card 
          title="Auto-Resolved" 
          value={stats.auto} 
          subtext="AI Handled"
          type="auto_resolved"
          active={activeFilter === 'auto_resolved'}
          icon={<CheckCircle className={activeFilter === 'auto_resolved' ? "text-emerald-600" : "text-emerald-500"} size={20} />} 
        />
        <Card 
          title="Pending Review" 
          value={stats.pending} 
          subtext="Action Required"
          type="pending"
          active={activeFilter === 'pending'}
          icon={<Clock className={activeFilter === 'pending' ? "text-amber-600" : "text-amber-500"} size={20} />} 
        />
        <Card 
          title="High Risk" 
          value={stats.risk} 
          subtext="Fraud Flags"
          type="high_risk"
          active={activeFilter === 'high_risk'}
          icon={<AlertTriangle className={activeFilter === 'high_risk' ? "text-red-600" : "text-red-500"} size={20} />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Live Claim Volume</h3>
          <div className="h-[300px] w-full">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={CHART_DATA}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} allowDecimals={false} />
                 <Tooltip cursor={{fill: '#f1f5f9'}} />
                 <Bar dataKey="claims" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
             <h3 className="text-lg font-bold text-slate-800">
               {activeFilter === 'all' ? 'All Claims' : 
                activeFilter === 'auto_resolved' ? 'Resolved Claims' :
                activeFilter === 'pending' ? 'Pending Action' : 'High Risk Alerts'}
             </h3>
             <span className="text-xs font-mono text-slate-400">Total: {filteredList.length}</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                 <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                   <th className="px-6 py-4">Claim ID</th>
                   <th className="px-6 py-4">Details</th>
                   <th className="px-6 py-4">Items</th>
                   <th className="px-6 py-4">Status</th>
                   <th className="px-6 py-4">Refund</th>
                   <th className="px-6 py-4 w-1/4">Reason</th>
                   <th className="px-6 py-4">Risk</th>
                   <th className="px-6 py-4 text-right">Action</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      No records found.
                    </td>
                  </tr>
                ) : filteredList.map((claim) => (
                  <tr key={claim.claim_id} className="hover:bg-slate-50 group text-sm transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">
                      {String(claim.claim_id).substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">Ord #{claim.order_id}</div>
                      <div className="text-xs text-slate-500">User #{claim.customer_id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-1 max-w-[180px]">
                        <Package size={14} className="text-slate-400 mt-0.5 flex-shrink-0"/>
                        <span className="text-xs text-slate-600 truncate" title={claim.items_detail}>
                          {claim.items_detail || '...'}
                        </span>
                      </div>
                      {claim.order_amount && (
                         <div className="text-xs text-slate-400 pl-4">Total: ${claim.order_amount.toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                        claim.status === 'approved' || claim.status === 'offer_accepted' ? 'bg-emerald-100 text-emerald-800' :
                        claim.status === 'rejected' || claim.status === 'offer_rejected' ? 'bg-red-100 text-red-800' :
                        claim.status === 'waiting_user_action' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {claim.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700 font-medium">
                       {claim.ai_decision?.refund_amount ? `$${claim.ai_decision.refund_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="truncate text-slate-600 max-w-[200px]" title={claim.ai_decision?.reason || claim.issue_description}>
                        {claim.ai_decision?.reason || claim.issue_description}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold uppercase tracking-wide ${
                        claim.risk_level === 'high' ? 'text-red-600' :
                        claim.risk_level === 'medium' ? 'text-amber-600' :
                        'text-emerald-600'
                      }`}>
                        {claim.risk_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setSelectedClaim(claim)}
                        className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                      >
                         Review <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Admin Review Modal */}
      {selectedClaim && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText size={20} className="text-blue-600"/>
                Review Claim {String(selectedClaim.claim_id).substring(0,8)}
              </h3>
              <button onClick={() => setSelectedClaim(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-lg flex items-center justify-between ${
                 selectedClaim.status === 'escalate' || selectedClaim.status === 'pending' || selectedClaim.status === 'waiting_user_action'
                 ? 'bg-amber-50 border border-amber-200 text-amber-800' 
                 : selectedClaim.status === 'approved' || selectedClaim.status === 'offer_accepted'
                 ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                 : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                 <div className="flex items-center gap-4">
                    <span className="font-semibold flex items-center gap-2">
                      Status: <span className="uppercase">{selectedClaim.status.replace(/_/g, ' ')}</span>
                    </span>
                    {selectedClaim.risk_level === 'high' && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded font-bold uppercase border border-red-200">
                          High Risk
                        </span>
                    )}
                 </div>
                 
                 {!isEditing && (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="text-xs flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors shadow-sm"
                    >
                      <Edit size={12} />
                      Override Decision
                    </button>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Customer</h4>
                  <p className="text-slate-900 font-medium">ID: {selectedClaim.customer_id}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Order</h4>
                  <p className="text-slate-900 font-medium">#{selectedClaim.order_id}</p>
                </div>
                <div>
                   <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Items</h4>
                   <p className="text-slate-700 font-medium">{selectedClaim.items_detail || 'N/A'}</p>
                </div>
                <div>
                   <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Order Total</h4>
                   <p className="text-slate-700 font-medium">
                      {selectedClaim.order_amount ? `$${selectedClaim.order_amount.toFixed(2)}` : 'N/A'}
                   </p>
                </div>
                <div className="col-span-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Issue Description</h4>
                  <p className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-700">
                    "{selectedClaim.issue_description}"
                  </p>
                </div>
              </div>

              {selectedClaim.ai_decision && !isEditing && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="font-bold text-slate-800 mb-2">AI Agent Analysis</h4>
                  <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm space-y-2">
                    <p><span className="font-semibold text-blue-900">Reasoning:</span> {selectedClaim.ai_decision.reason}</p>
                    <p><span className="font-semibold text-blue-900">Recommendation:</span> {selectedClaim.ai_decision.status.toUpperCase()}</p>
                    {selectedClaim.ai_decision.refund_amount && (
                       <p><span className="font-semibold text-blue-900">Refund:</span> ${selectedClaim.ai_decision.refund_amount.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Manual Resolution Config (Visible if editing) */}
              {isEditing && (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <DollarSign size={16} /> Admin Override / Manual Resolution
                    </h4>
                    <span className="text-xs text-slate-500 uppercase tracking-wide font-bold">Editing Mode</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Resolution Type</label>
                      <select 
                        className="w-full h-9 rounded border border-slate-300 px-2 text-sm bg-white"
                        value={manualResolution}
                        onChange={(e) => setManualResolution(e.target.value as ResolutionType)}
                      >
                        <option value={ResolutionType.FULL_REFUND}>Full Refund</option>
                        <option value={ResolutionType.PARTIAL_REFUND}>Partial Refund</option>
                        <option value={ResolutionType.REPLACEMENT}>Replacement</option>
                        <option value={ResolutionType.NONE}>No Refund (Reject)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Refund Amount ($)</label>
                      <input 
                        type="number" 
                        className="w-full h-9 rounded border border-slate-300 px-2 text-sm"
                        value={manualRefundAmount}
                        onChange={(e) => setManualRefundAmount(Number(e.target.value))}
                        disabled={manualResolution === ResolutionType.NONE || manualResolution === ResolutionType.REPLACEMENT}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Reason for Change / Note to User</label>
                      <textarea
                        className="w-full p-2 rounded border border-slate-300 text-sm h-20"
                        placeholder="Explain why you are changing the decision (e.g., 'Per company policy, we can offer a replacement...')"
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 italic">
                    Submitting this will update the User's claim status to "Waiting User Action" so they can accept or reject your offer.
                  </p>
                </div>
              )}

            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                {isEditing ? "Select final status to save:" : "View only mode"}
              </span>
              
              <div className="flex gap-3">
                {!isEditing ? (
                   <button 
                   onClick={() => setSelectedClaim(null)}
                   className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                 >
                   Close
                 </button>
                ) : (
                  <>
                     <button 
                       onClick={() => setIsEditing(false)}
                       className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium"
                     >
                       Cancel Edit
                     </button>
                     <button 
                      onClick={() => handleManualAction(ClaimStatus.REJECTED)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-red-100 border border-red-200 rounded-lg text-red-700 hover:bg-red-200 font-medium flex items-center gap-2"
                    >
                      {actionLoading ? "..." : <><X size={16} /> Reject</>}
                    </button>
                    <button 
                      onClick={() => handleManualAction(ClaimStatus.APPROVED)}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-emerald-600 border border-emerald-700 rounded-lg text-white hover:bg-emerald-700 font-medium flex items-center gap-2"
                    >
                      {actionLoading ? "..." : <><Send size={16} /> Submit Offer to User</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
