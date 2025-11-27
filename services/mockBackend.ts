
import { createClient } from '@supabase/supabase-js';
import { MistralDecision, OrderMaster, OrderItem, ValidationPayload, UserInput, ClaimRecord, ClaimStatus, ResolutionType } from '../types';

// --- 1. Supabase Configuration ---
const SUPABASE_URL = "https://suvhjckbzieqgvuzytar.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dmhqY2tiemllcWd2dXp5dGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNDgzNjYsImV4cCI6MjA3OTcyNDM2Nn0.Rh5MXnJ1UYgAj3nqOdd1w4J3eDv8vJceoW0B9ML3WVo";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. Mistral Configuration ---
const MISTRAL_API_KEY = "c7Wro5veySWm55eEs8I5ynf15CD8t2SX";
const MISTRAL_AGENT_ID = "ag_019abeb5ace9722f86ebd38da633f96a";

// --- Local Storage Keys ---
const LOCAL_STORAGE_KEY = 'arc_drx_claims';

// --- Helper Functions for Local Storage ---
const getLocalClaims = (): ClaimRecord[] => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Error reading local storage", e);
    return [];
  }
};

const saveLocalClaim = (claim: ClaimRecord) => {
  try {
    const claims = getLocalClaims();
    // Prevent duplicates if possible, though ID should be unique
    const newClaims = [claim, ...claims]; 
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedClaims));
  } catch (e) {
    console.error("Error updating local storage", e);
  }
};

// --- 3. Database Action Functions ---

const mapRowsToClaims = (rows: any[]): ClaimRecord[] => {
    return (rows || []).map(row => ({
      claim_id: row.claim_id || row.id,
      order_id: row.order_id,
      customer_id: row.user_id || row.customer_id,
      issue_description: row.description || row.issue_description,
      requested_resolution: row.refund_category || row.requested_resolution,
      created_at: row.created_at,
      status: row.claim_status || row.status || 'pending',
      risk_level: row.risk_level || 'low',
      ai_decision: row.ai_decision || null
    }));
};

/**
 * Hydrates claims with Order Master and Item details for rich history
 */
const hydrateClaimsWithOrderData = async (claims: ClaimRecord[]): Promise<ClaimRecord[]> => {
  if (claims.length === 0) return [];
  
  const orderIds = [...new Set(claims.map(c => c.order_id))];
  
  try {
      const { data: orders, error } = await supabase
          .from('order_master')
          .select(`
              order_id, 
              total_amount, 
              order_items (
                  product_name,
                  quantity,
                  price_per_unit
              )
          `)
          .in('order_id', orderIds);
          
      if (error || !orders) {
          // Fallback: If DB fetch fails, try to return what we have (some info is better than none)
          return claims;
      }

      return claims.map(claim => {
          const order = orders.find(o => o.order_id === claim.order_id);
          const itemsStr = order?.order_items
              ?.map((i: any) => `${i.quantity}x ${i.product_name}`)
              .join(', ') || '';
          
          return {
              ...claim,
              order_amount: order?.total_amount,
              items_detail: itemsStr
          };
      });
  } catch (e) {
      console.warn("Hydration failed, returning basic claims", e);
      return claims;
  }
};

/**
 * Fetches all claims for the Admin Dashboard.
 */
export const getClaims = async (): Promise<ClaimRecord[]> => {
  try {
    // Attempt Supabase fetch
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .order('created_at', { ascending: false });

    let claimRecords: ClaimRecord[] = [];

    if (error) {
      console.warn('Supabase fetch failed (Admin), falling back to local history:', error.message);
      claimRecords = getLocalClaims();
    } else if (!data || data.length === 0) {
        // If DB is empty, check local
        const local = getLocalClaims();
        claimRecords = local.length > 0 ? local : [];
    } else {
        claimRecords = mapRowsToClaims(data);
    }
    
    // Hydrate with Item Details
    return await hydrateClaimsWithOrderData(claimRecords);

  } catch (err) {
    console.warn('Network error in getClaims, using local history');
    const local = getLocalClaims();
    return await hydrateClaimsWithOrderData(local);
  }
};

/**
 * Fetches claims specific to a user.
 */
export const getUserClaims = async (userId: number): Promise<ClaimRecord[]> => {
    try {
      if (userId === 0) return getClaims();

      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .or(`user_id.eq.${userId},customer_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      let claimRecords: ClaimRecord[] = [];

      if (error) {
          console.warn('Supabase fetch failed (User), falling back to local history:', error.message);
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
      console.warn('Error getting user claims, using local history');
      const allLocal = getLocalClaims();
      const userClaims = allLocal.filter(c => Number(c.customer_id) === Number(userId) || userId === 501);
      return await hydrateClaimsWithOrderData(userClaims);
    }
};

/**
 * Saves a new claim to the database after AI processing.
 */
export const saveClaim = async (input: UserInput, decision: MistralDecision): Promise<ClaimRecord> => {
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
        const { data, error } = await supabase
            .from('claims')
            .insert(newClaimObj)
            .select()
            .single();

        if (error) {
            throw error; // Throw to catch block for fallback
        }

        return mapRowsToClaims([data])[0];
    } catch (e) {
        console.warn("Supabase insert failed, saving locally to ensure history maintenance.", e);
        
        // Generate a local record
        const localRecord: ClaimRecord = {
             claim_id: `LOC-${Date.now()}`, // Temporary ID
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

/**
 * Admin updates a claim status manually.
 */
export const updateClaimStatus = async (
  claimId: string, 
  newStatus: ClaimStatus, 
  resolutionType?: ResolutionType, 
  refundAmount?: number, 
  adminNotes?: string
): Promise<void> => {
  // Determine the AI Status string based on claim status
  const aiStatus = (newStatus === ClaimStatus.APPROVED || newStatus === ClaimStatus.OFFER_ACCEPTED ? 'approved' : 
                    newStatus === ClaimStatus.REJECTED || newStatus === ClaimStatus.OFFER_REJECTED ? 'rejected' : 
                    'escalate') as 'approved' | 'rejected' | 'escalate';
  
  const finalResolution = (resolutionType as any) || 'not_sure';
  
  try {
      // Optimistic update for DB (might fail in this demo environment but we keep structure)
      await supabase
        .from('claims')
        .update({ 
            claim_status: newStatus,
            status: newStatus,
        })
        .or(`claim_id.eq.${claimId},id.eq.${claimId}`);

      // We ALWAYS update local because that's our consistent view for this demo
      const claims = getLocalClaims();
      const target = claims.find(c => String(c.claim_id) === String(claimId));
      
      if (target) {
          // Append admin notes to reason if provided
          let newReason = target.ai_decision?.reason || "Manual update";
          if (adminNotes) {
             newReason = `Admin Update: ${adminNotes}. (Original: ${newReason})`;
          }

          const updatedRecord = {
              ...target,
              status: newStatus,
              ai_decision: target.ai_decision ? {
                  ...target.ai_decision,
                  status: aiStatus,
                  resolution_type: finalResolution,
                  refund_amount: refundAmount !== undefined ? refundAmount : target.ai_decision.refund_amount,
                  reason: newReason,
                  next_steps: newStatus === ClaimStatus.WAITING_USER_ACTION 
                      ? "Action Required: Please accept or reject the updated offer."
                      : "Case resolved manually by admin."
              } : {
                  // If AI decision was null (rare), create a dummy one so the UI works
                  status: aiStatus,
                  resolution_type: finalResolution,
                  refund_amount: refundAmount || 0,
                  reason: adminNotes || "Manual Admin Action",
                  confidence_score: 1,
                  escalation_required: false,
                  next_steps: "Resolved manually by admin.",
                  data_source_connected: true
              }
          };
          updateLocalClaim(claimId, updatedRecord);
      }

  } catch (err) {
      console.warn("Supabase update failed, updating local history:", err);
      // Fallback: Update local storage
      const claims = getLocalClaims();
      const target = claims.find(c => String(c.claim_id) === String(claimId));
      if (target) {
        let newReason = target.ai_decision?.reason || "Manual update";
        if (adminNotes) {
           newReason = `Admin Update: ${adminNotes}. (Original: ${newReason})`;
        }
        
          const updatedRecord = {
              ...target,
              status: newStatus,
              ai_decision: target.ai_decision ? {
                  ...target.ai_decision,
                  status: aiStatus,
                  resolution_type: finalResolution,
                  refund_amount: refundAmount !== undefined ? refundAmount : target.ai_decision.refund_amount,
                  reason: newReason,
                   next_steps: newStatus === ClaimStatus.WAITING_USER_ACTION 
                      ? "Action Required: Please accept or reject the updated offer."
                      : "Case resolved manually by admin."
              } : {
                 status: aiStatus,
                 resolution_type: finalResolution,
                 refund_amount: refundAmount || 0,
                 reason: adminNotes || "Manual Admin Action",
                 confidence_score: 1,
                 escalation_required: false,
                 next_steps: "Resolved manually by admin.",
                 data_source_connected: true
              }
          };
          updateLocalClaim(claimId, updatedRecord);
      }
  }
};

/**
 * Handles user response to an admin offer.
 */
export const userRespondToOffer = async (claimId: string, accepted: boolean): Promise<void> => {
    const newStatus = accepted ? ClaimStatus.OFFER_ACCEPTED : ClaimStatus.OFFER_REJECTED;
    const note = accepted ? "User ACCEPTED the offer." : "User REJECTED the offer.";

    const claims = getLocalClaims();
    const target = claims.find(c => String(c.claim_id) === String(claimId));
    
    if (target && target.ai_decision) {
        const currentReason = target.ai_decision.reason;
        
        await updateClaimStatus(
            claimId, 
            newStatus, 
            target.ai_decision.resolution_type as any, // keep existing offer details
            target.ai_decision.refund_amount || 0,
            note
        );
    }
};

/**
 * Fetches order data from Supabase order_master and order_items.
 */
export const fetchOrderData = async (orderId: number): Promise<ValidationPayload> => {
  try {
      const { data: orderData, error: orderError } = await supabase
        .from('order_master')
        .select(`
          *,
          order_items (*)
        `)
        .eq('order_id', orderId)
        .single();

      if (orderError || !orderData) {
          console.warn("Order not found in DB:", orderError);
          // Return empty structure, Agent will likely reject due to missing data (No Hallucination Rule)
          return {
              order_master: null,
              order_items: [],
              prior_claims: []
          };
      }

      // Fetch prior claims for this order to check history
      // We check both DB and Local for prior claims to be safe
      const { data: dbClaims } = await supabase
          .from('claims')
          .select('*')
          .eq('order_id', orderId);

      const localClaims = getLocalClaims().filter(c => c.order_id === orderId);
      
      const mappedDbClaims = mapRowsToClaims(dbClaims || []);
      // Merge unique claims (simple concatenation for context)
      const allPriorClaims = [...mappedDbClaims, ...localClaims];

      return {
          order_master: {
              order_id: orderData.order_id,
              customer_id: orderData.customer_id,
              delivery_status: orderData.delivery_status,
              payment_status: orderData.payment_status,
              total_amount: orderData.total_amount,
              delivery_date: orderData.delivery_date
          },
          order_items: orderData.order_items || [],
          prior_claims: allPriorClaims
      };
  } catch (err) {
      console.error("Error fetching order data:", err);
      return {
          order_master: null,
          order_items: [],
          prior_claims: []
      };
  }
};

// --- 4. Mistral Agent Integration ---

/**
 * Calls the Mistral Agent API to process the claim.
 */
export const callMistralAgent = async (input: UserInput, validation: ValidationPayload): Promise<MistralDecision> => {
  const agentPayload = {
    mode: "structured",
    user_input: input,
    validation_payload: validation
  };

  try {
    const response = await fetch("https://api.mistral.ai/v1/agents/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: MISTRAL_AGENT_ID,
        messages: [
          {
            role: "user",
            content: JSON.stringify(agentPayload)
          }
        ]
      })
    });

    if (response.status === 429) {
      // Log as info to avoid console clutter, since we handle it gracefully
      console.info("Mistral 429: Service capacity exceeded, switching to manual fallback.");
      throw new Error("Service tier capacity exceeded. Switching to manual review.");
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Mistral API Error:", response.status, errorText);
      throw new Error(`Mistral API returned status: ${response.status}`);
    }

    const data = await response.json();
    const messageContent = data.choices?.[0]?.message?.content;
    
    if (!messageContent) {
      throw new Error("Empty response from Mistral Agent");
    }

    const cleanJson = messageContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const decision: MistralDecision = JSON.parse(cleanJson);
    
    return decision;

  } catch (error) {
    console.error("Agent Error:", error instanceof Error ? error.message : "Unknown");

    // Fallback logic if API fails (Rate Limit or Network)
    // We escalate so the Admin Dashboard catches it
    return {
      status: 'escalate',
      resolution_type: 'none',
      refund_amount: null,
      reason: `Automated analysis unavailable: ${(error instanceof Error ? error.message : "System Busy")}. Flagged for human review.`,
      confidence_score: 0,
      escalation_required: true,
      next_steps: "Your claim has been queued for manual review by a support specialist.",
      data_source_connected: validation.order_master !== null // We know if DB worked based on validation payload
    };
  }
};
