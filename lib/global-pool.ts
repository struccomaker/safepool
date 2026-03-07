// The single global SafePool fund — everyone contributes here, payouts go to affected members
export const GLOBAL_POOL_ID = '00000000-0000-0000-0000-000000000001'

export const GLOBAL_POOL_CONFIG = {
  name: 'SafePool Global Fund',
  description: 'One shared emergency fund. Contribute together — when disaster strikes, affected members receive instant Interledger payouts.',
  currency: 'USD',
  distribution_model: 'equal_split' as const,
  payout_cap: 500,
  trigger_rules: {
    minMagnitude: 6.0,
    disasterTypes: ['earthquake', 'flood', 'typhoon', 'cyclone', 'volcanic', 'tsunami', 'fire'],
    radius_km: 100,
  },
}
