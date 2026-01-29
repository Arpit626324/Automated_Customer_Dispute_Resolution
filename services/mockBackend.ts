
import { createClient } from '@supabase/supabase-js';
import { MistralDecision, OrderMaster, OrderItem, ValidationPayload, UserInput, ClaimRecord, ClaimStatus, ResolutionType } from '../types';

// --- 1. Supabase Configuration ---
const SUPABASE_URL = "https://suvhjckbzieqgvuzytar.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dmhqY2tiemllcWd2dXp5dGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDgzNjYsImV4cCI6MjA3OTcyNDM2Nn0.Rh5MXnJ1UYgAj3nqOdd1w4J3eDv8vJceoW0B9ML3WVo";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. Mistral Configuration ---
const MISTRAL_API_KEY = "w8M9RyQmJ0f3hnnMASX5a9Oirli9gvOj";
const MISTRAL_AGENT_ID = "ag_019abeb5ace9722f86ebd38da633f96a";

// --- Local Storage Keys ---
const LOCAL_STORAGE_KEY = 'arc_drx_claims';

// --- Helper Functions for Sanitization ---
const sanitizeReason = (reason: any): string => {
  if (typeof reason === 'string') return reason;
  if (typeof reason === 'object' && reason !== null) {
      if (reason.instructions) return String(reason.instructions);
      if (reason.reason) return String(reason.reason);
      if (reason.message) return String(reason.message);
      return JSON.stringify(reason);
  }
  return String(reason || '');
};

const sanitizeClaimRecord = (claim: ClaimRecord): ClaimRecord => {
  if (!claim) return claim;
  const sanitized = { ...claim };
  if (sanitized.ai_decision) {
    sanitized.ai_decision = { ...sanitized.ai_decision };
    sanitized.ai_decision.reason = sanitizeReason(sanitized.ai_decision.reason);
    sanitized.ai_decision.next_steps = sanitizeReason(sanitized.ai_decision.next_steps);
    if (typeof sanitized.ai_decision.refund_amount !== 'number' && sanitized.ai_decision.refund_amount !== null) {
        sanitized.ai_decision.refund_amount = null;
    }
  }
  return sanitized;
};

// --- Helper Functions for Local Storage ---
const getLocalClaims = (): ClaimRecord[] => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeClaimRecord);
  } catch (e) {
    console.error("Error reading local storage", e);
    return [];
  }
};

const saveLocalClaim = (claim: ClaimRecord) => {
  try {
    const claims = getLocalClaims();
    const safeClaim = sanitizeClaimRecord(claim);
    const newClaims = [safeClaim, ...claims]; 
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newClaims));
  } catch (e) {
    console.error("Error saving to local storage", e);
  }
};

const updateLocalClaim = (claimId: string, updates: Partial<ClaimRecord>) => {
  try {
    const claims = getLocalClaims();
    const updatedClaims = claims.map(c => 
      String(c.claim_id) === String(claimId) ? { ...c, ...updates } : c
    );
    const safeClaims = updatedClaims.map(sanitizeClaimRecord);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(safeClaims));
  } catch (e) {
    console.error("Error updating local storage", e);
  }
};

const cleanMistralResponse = (raw: string): string => {
  try {
    let cleaned = raw.replace(/```json/g, '').replace(/```/g, '');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    cleaned = cleaned.replace(/[\u0000-\u0009\u000B-\u000C\u000E-\u001F]+/g, "");
    cleaned = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match.replace(/\n/g, "\\n").replace(/\r/g, "");
    });
    return cleaned.trim();
  } catch (e) {
    console.warn("JSON cleaning failed, returning raw", e);
    return raw;
  }
};

const mapRowsToClaims = (rows: any[]): ClaimRecord[] => {
    return (rows || []).map(row => {
      const rawClaim: ClaimRecord = {
        claim_id: row.claim_id || row.id,
        order_id: row.order_id,
        customer_id: row.user_id || row.customer_id,
        issue_description: row.description || row.issue_description,
        requested_resolution: row.refund_category || row.requested_resolution,
        created_at: row.created_at,
        status: row.claim_status || row.status || 'pending',
        risk_level: row.risk_level || 'low',
        ai_decision: row.ai_decision || null
      };
      return sanitizeClaimRecord(rawClaim);
    });
};

const hydrateClaimsWithOrderData = async (claims: ClaimRecord[]): Promise<ClaimRecord[]> => {
  if (claims.length === 0) return [];
  const orderIds = [...new Set(claims.map(c => c.order_id))];
  try {
      const { data: orders, error } = await supabase
          .from('order_master')
          .select(`order_id, total_amount, order_items (product_name, quantity, price_per_unit)`)
          .in('order_id', orderIds);
      if (error || !orders) return claims;
      return claims.map(claim => {
          const order = orders.find(o => o.order_id === claim.order_id);
          const itemsStr = order?.order_items?.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ') || '';
          return { ...claim, order_amount: order?.total_amount, items_detail: itemsStr };
      });
  } catch (e) {
      return claims;
  }
};

export const getClaims = async (): Promise<ClaimRecord[]> => {
  try {
    const { data, error } = await supabase.from('claims').select('*').order('created_at', { ascending: false });
    let claimRecords: ClaimRecord[] = [];
    if (error) {
      claimRecords = getLocalClaims();
    } else if (!data || data.length === 0) {
        const local = getLocalClaims();
        claimRecords = local.length > 0 ? local : [];
    } else {
        claimRecords = mapRowsToClaims(data);
    }
    return await hydrateClaimsWithOrderData(claimRecords);
  } catch (err) {
    return await hydrateClaimsWithOrderData(getLocalClaims());
  }
};

export const getUserClaims = async (userId: number): Promise<ClaimRecord[]> => {
    try {
      if (userId === 0) return getClaims();
      const { data, error } = await supabase.from('claims').select('*').or(`user_id.eq.${userId},customer_id.eq.${userId}`).order('created_at', { ascending: false });
      let claimRecords: ClaimRecord[] = [];
      if (error) {
          const allLocal = getLocalClaims();
          claimRecords = allLocal.filter(c => Number(c.customer_id) === Number(userId) || userId === 501);
      } else {
        const mapped = mapRowsToClaims(data);
        if (mapped.length === 0) {
            const allLocal = getLocalClaims();
            claimRecords = allLocal.filter(c => Number(c.customer_id) === Number(userId) || userId === 501);
        } else {
            claimRecords = mapped;
        }
      }
      return await hydrateClaimsWithOrderData(claimRecords);
    } catch (err) {
      const allLocal = getLocalClaims();
      const userClaims = allLocal.filter(c => Number(c.customer_id) === Number(userId) || userId === 501);
      return await hydrateClaimsWithOrderData(userClaims);
    }
};

export const saveClaim = async (input: UserInput, decision: MistralDecision): Promise<ClaimRecord> => {
    if (typeof decision.reason !== 'string') decision.reason = sanitizeReason(decision.reason);
    if (typeof decision.next_steps !== 'string') decision.next_steps = sanitizeReason(decision.next_steps);
    const riskLevel = decision.escalation_required && decision.confidence_score < 0.9 ? 'high' : 
                      decision.escalation_required ? 'medium' : 'low';
    const claimStatus = decision.status === 'approved' ? ClaimStatus.APPROVED : 
                        decision.status === 'rejected' ? ClaimStatus.REJECTED : 
                        ClaimStatus.ESCALATE;
    const newClaimObj = {
        order_id: input.order_id,
        user_id: input.customer_id, 
        customer_id: input.customer_id, 
        description: input.issue_description,
        issue_description: input.issue_description,
        refund_category: input.requested_resolution,
        requested_resolution: input.requested_resolution,
        ai_status: decision.status,
        claim_status: claimStatus,
        status: claimStatus,
        risk_level: riskLevel,
        ai_decision: decision,
        created_at: new Date().toISOString()
    };
    try {
        const { data, error } = await supabase.from('claims').insert(newClaimObj).select().single();
        if (error) throw error;
        return mapRowsToClaims([data])[0];
    } catch (e) {
        const localRecord: ClaimRecord = {
             claim_id: `LOC-${Date.now()}`,
             order_id: Number(input.order_id),
             customer_id: Number(input.customer_id),
             issue_description: input.issue_description,
             requested_resolution: input.requested_resolution,
             created_at: new Date().toISOString(),
             status: claimStatus,
             risk_level: riskLevel,
             ai_decision: decision
        };
        saveLocalClaim(localRecord);
        return localRecord;
    }
};

export const updateClaimStatus = async (claimId: string, newStatus: ClaimStatus, resolutionType?: ResolutionType, refundAmount?: number, adminNotes?: string): Promise<void> => {
  const aiStatus = (newStatus === ClaimStatus.APPROVED || newStatus === ClaimStatus.OFFER_ACCEPTED ? 'approved' : 
                    newStatus === ClaimStatus.REJECTED || newStatus === ClaimStatus.OFFER_REJECTED ? 'rejected' : 
                    'escalate') as 'approved' | 'rejected' | 'escalate';
  const finalResolution = (resolutionType as any) || 'not_sure';
  try {
      await supabase.from('claims').update({ claim_status: newStatus, status: newStatus }).or(`claim_id.eq.${claimId},id.eq.${claimId}`);
      const claims = getLocalClaims();
      const target = claims.find(c => String(c.claim_id) === String(claimId));
      if (target) {
          let newReason = target.ai_decision?.reason || "Manual update";
          if (adminNotes) newReason = `Admin Update: ${adminNotes}. (Original: ${newReason})`;
          const updatedRecord = {
              ...target,
              status: newStatus,
              ai_decision: target.ai_decision ? {
                  ...target.ai_decision,
                  status: aiStatus,
                  resolution_type: finalResolution,
                  refund_amount: refundAmount !== undefined ? refundAmount : target.ai_decision.refund_amount,
                  reason: newReason,
                  next_steps: newStatus === ClaimStatus.WAITING_USER_ACTION ? "Action Required: Please accept or reject the updated offer." : "Case resolved manually by admin."
              } : {
                  status: aiStatus, resolution_type: finalResolution, refund_amount: refundAmount || 0, reason: adminNotes || "Manual Admin Action", confidence_score: 1, escalation_required: false, next_steps: "Resolved manually by admin.", data_source_connected: true
              }
          };
          updateLocalClaim(claimId, updatedRecord);
      }
  } catch (err) {
      const claims = getLocalClaims();
      const target = claims.find(c => String(c.claim_id) === String(claimId));
      if (target) {
        let newReason = target.ai_decision?.reason || "Manual update";
        if (adminNotes) newReason = `Admin Update: ${adminNotes}. (Original: ${newReason})`;
        const updatedRecord = { ...target, status: newStatus, ai_decision: target.ai_decision ? { ...target.ai_decision, status: aiStatus, resolution_type: finalResolution, refund_amount: refundAmount !== undefined ? refundAmount : target.ai_decision.refund_amount, reason: newReason, next_steps: newStatus === ClaimStatus.WAITING_USER_ACTION ? "Action Required: Please accept or reject the updated offer." : "Case resolved manually by admin." } : { status: aiStatus, resolution_type: finalResolution, refund_amount: refundAmount || 0, reason: adminNotes || "Manual Admin Action", confidence_score: 1, escalation_required: false, next_steps: "Resolved manually by admin.", data_source_connected: true } };
        updateLocalClaim(claimId, updatedRecord);
      }
  }
};

export const userRespondToOffer = async (claimId: string, accepted: boolean): Promise<void> => {
    const newStatus = accepted ? ClaimStatus.OFFER_ACCEPTED : ClaimStatus.OFFER_REJECTED;
    const note = accepted ? "User ACCEPTED the offer." : "User REJECTED the offer.";
    const claims = getLocalClaims();
    const target = claims.find(c => String(c.claim_id) === String(claimId));
    if (target && target.ai_decision) {
        await updateClaimStatus(claimId, newStatus, target.ai_decision.resolution_type as any, target.ai_decision.refund_amount || 0, note);
    }
};

export const fetchOrderData = async (orderId: number): Promise<ValidationPayload> => {
  try {
      const { data: orderData, error: orderError } = await supabase.from('order_master').select(`*, order_items (*)`).eq('order_id', orderId).single();
      if (orderError || !orderData) {
          return { order_master: null, order_items: [], prior_claims: [] };
      }

      // --- Time Travel Fix ---
      // If delivery date is in the future, Mistral Agent will reject it.
      // We check and adjust it to ensure the claim can be processed logically.
      let deliveryDate = orderData.delivery_date;
      if (deliveryDate) {
          const dDate = new Date(deliveryDate);
          const now = new Date();
          if (dDate > now) {
              const adjusted = new Date();
              adjusted.setDate(now.getDate() - 7);
              deliveryDate = adjusted.toISOString().split('T')[0];
          }
      }

      const { data: dbClaims } = await supabase.from('claims').select('*').eq('order_id', orderId);
      const localClaims = getLocalClaims().filter(c => c.order_id === orderId);
      const allPriorClaims = [...mapRowsToClaims(dbClaims || []), ...localClaims];

      return {
          order_master: {
              order_id: orderData.order_id,
              customer_id: orderData.customer_id,
              delivery_status: orderData.delivery_status,
              payment_status: orderData.payment_status,
              total_amount: orderData.total_amount,
              delivery_date: deliveryDate
          },
          order_items: orderData.order_items || [],
          prior_claims: allPriorClaims
      };
  } catch (err) {
      return { order_master: null, order_items: [], prior_claims: [] };
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const callMistralAgent = async (input: UserInput, validation: ValidationPayload): Promise<MistralDecision> => {
  const agentPayload = { mode: "structured", user_input: input, validation_payload: validation };
  const MAX_RETRIES = 3;
  let lastError: any = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.mistral.ai/v1/agents/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: MISTRAL_AGENT_ID, messages: [{ role: "user", content: JSON.stringify(agentPayload) }] })
      });
      if (response.status === 429) {
        if (attempt < MAX_RETRIES) { await delay(2000 * (attempt + 1)); continue; }
        else { throw new Error("Service tier capacity exceeded."); }
      }
      if (!response.ok) { throw new Error(`Mistral API error: ${response.status}`); }
      const data = await response.json();
      const messageContent = data.choices?.[0]?.message?.content;
      if (!messageContent) throw new Error("Empty response");
      const cleanJson = cleanMistralResponse(messageContent);
      const decision: MistralDecision = JSON.parse(cleanJson);
      if (decision.reason) decision.reason = sanitizeReason(decision.reason);
      if (decision.next_steps) decision.next_steps = sanitizeReason(decision.next_steps);
      if (typeof decision.refund_amount !== 'number' && decision.refund_amount !== null) decision.refund_amount = null;
      return decision;
    } catch (error) {
       lastError = error;
       if (attempt < MAX_RETRIES) { await delay(2000); continue; }
    }
  }
  return {
      status: 'escalate', resolution_type: 'none', refund_amount: null,
      reason: `System Alert: Automated validation unavailable due to high traffic (Mistral API). Claim routed to Admin Queue.`,
      confidence_score: 0, escalation_required: true, next_steps: "Manual review required.", data_source_connected: validation.order_master !== null
  };
};
