// ─── Enums ────────────────────────────────────────────────────────────────────

export type DistributionModel = 'equal_split' | 'severity_based' | 'household_size' | 'capped'
export type ContributionFrequency = 'daily' | 'weekly' | 'monthly' | 'event_based'
export type DisasterType = 'earthquake' | 'flood' | 'typhoon' | 'cyclone' | 'volcanic' | 'tsunami' | 'fire'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type ContributionStatus = 'pending' | 'completed' | 'failed'
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ProposalStatus = 'open' | 'passed' | 'rejected' | 'expired'
export type VoteChoice = 'yes' | 'no' | 'abstain'
export type ChangeType = 'trigger_rules' | 'distribution_model' | 'payout_cap' | 'contribution_amount'
export type DisasterSource = 'usgs' | 'gdacs' | 'owm'

// ─── Trigger Rules (stored as JSON string in ClickHouse) ──────────────────────

export interface TriggerRules {
  minMagnitude: number
  disasterTypes: DisasterType[]
  radius_km: number
}

export interface GovernanceRules {
  quorum_pct: number
  vote_threshold: number
}

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Pool {
  id: string
  name: string
  description: string
  created_by: string
  distribution_model: DistributionModel
  contribution_frequency: ContributionFrequency
  contribution_amount: number
  currency: string
  trigger_rules: string // JSON string
  governance_rules: string // JSON string
  payout_cap: number
  created_at: string
  is_active: number
}

export interface Member {
  id: string
  pool_id: string
  user_id: string
  wallet_address: string
  location_lat: number
  location_lon: number
  household_size: number
  joined_at: string
  is_active: number
}

export interface Contribution {
  id: string
  pool_id: string
  member_id: string
  amount: number
  currency: string
  incoming_payment_id: string
  contributed_at: string
  status: ContributionStatus
}

export interface DisasterEvent {
  id: string
  source: DisasterSource
  external_id: string
  disaster_type: DisasterType
  magnitude: number
  severity: Severity
  location_name: string
  location_lat: number
  location_lon: number
  occurred_at: string
  raw_data: string
  processed: number
}

export interface Payout {
  id: string
  pool_id: string
  disaster_event_id: string
  member_id: string
  amount: number
  currency: string
  outgoing_payment_id: string
  distribution_rule: string
  payout_at: string
  status: PayoutStatus
  failure_reason: string
}

export interface Proposal {
  id: string
  pool_id: string
  proposed_by: string
  title: string
  description: string
  change_type: ChangeType
  new_value: string
  created_at: string
  voting_ends_at: string
  status: ProposalStatus
}

export interface Vote {
  id: string
  proposal_id: string
  member_id: string
  pool_id: string
  vote: VoteChoice
  voted_at: string
}

export interface User {
  id: string
  email: string
  name: string
  created_at: string
}

// ─── Analytics / Materialized Views ──────────────────────────────────────────

export interface PoolBalance {
  pool_id: string
  month: number
  total_in: number
  contribution_count: number
}

export interface PayoutLatency {
  pool_id: string
  disaster_type: DisasterType
  avg_latency_seconds: number
  payout_count: number
}

export interface ContributionStreak {
  pool_id: string
  member_id: string
  week: number
  year: number
  weekly_contributions: number
}

export interface DisasterHeatmapPoint {
  grid_lat: number
  grid_lon: number
  disaster_type: DisasterType
  event_count: number
  max_magnitude: number
}

// ─── API Request/Response Shapes ──────────────────────────────────────────────

export interface JoinRequest {
  wallet_address: string
  location_lat: number
  location_lon: number
  household_size?: number
}

export interface ContributeRequest {
  amount: number
  currency: string
  wallet_address?: string
  member_id?: string
}

export interface ManualTriggerRequest {
  disaster_type: DisasterType
  magnitude: number
  location_lat: number
  location_lon: number
  location_name: string
}

export interface ProposeRequest {
  pool_id: string
  title: string
  description: string
  change_type: ChangeType
  new_value: string
  voting_days?: number
}

export interface VoteRequest {
  proposal_id: string
  pool_id: string
  vote: VoteChoice
}

// ─── SSE Ticker ───────────────────────────────────────────────────────────────

export interface TickerEvent {
  type: 'contribution' | 'payout' | 'disaster'
  label: string
  amount?: number
  currency?: string
  timestamp: string
}
