
export enum ResolutionType {
  FULL_REFUND = 'full_refund',
  PARTIAL_REFUND = 'partial_refund',
  REPLACEMENT = 'replacement',
  NONE = 'none',
  NOT_SURE = 'not_sure'
}

export enum ClaimStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ESCALATE = 'escalate',
  PENDING = 'pending',
  // New statuses for negotiation workflow
  WAITING_USER_ACTION = 'waiting_user_action',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_REJECTED = 'offer_rejected'
}

export interface MistralDecision {
  status: 'approved' | 'rejected' | 'escalate';
  resolution_type: 'full_refund' | 'partial_refund' | 'replacement' | 'none';
  refund_amount: number | null;
  reason: string;
  confidence_score: number;
  escalation_required: boolean;
  next_steps: string;
  data_source_connected: boolean;
}

export interface OrderMaster {
  order_id: number;
  customer_id: number;
  delivery_status: 'delivered' | 'in_transit' | 'pending' | 'cancelled';
  payment_status: 'paid' | 'unpaid' | 'refunded';
  total_amount: number;
  delivery_date?: string;
}

export interface OrderItem {
  product_name: string;
  quantity: number;
  price_per_unit: number;
}

export interface ClaimRecord {
  claim_id: string;
  order_id: number;
  customer_id: number;
  issue_description: string;
  requested_resolution: string;
  created_at: string;
  ai_decision: MistralDecision | null;
  status: ClaimStatus;
  risk_level: 'low' | 'medium' | 'high';
  // New fields for detailed history
  order_amount?: number;
  items_detail?: string;
}

export interface ValidationPayload {
  order_master: OrderMaster | null;
  order_items: OrderItem[];
  prior_claims: ClaimRecord[];
}

export interface UserInput {
  order_id: number;
  customer_id: number;
  issue_description: string;
  requested_resolution: string;
  attachments?: string[];
}
