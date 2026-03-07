import { PayoutParameters } from "@/app/api/governance/parameters/route"

export async function getPayoutParameters(): Promise<PayoutParameters> {
  const res = await fetch(`/api/governance/parameters`)
  const { parameters } = await res.json()
  return parameters
}

// export async function partitionAndDisburse(disasterEvent: DisasterEvent) {
//   const { safety_cap, trigger_sensitivity, impact_radius } = await getPayoutParameters()

//   // Gate 1 — magnitude threshold
//   if (disasterEvent.magnitude < trigger_sensitivity) {
//     return { disbursed: false, reason: 'Below trigger sensitivity threshold' }
//   }

//   // Gate 2 — impact radius (distance from epicentre to affected zone)
//   if (disasterEvent.impact_distance_km > impact_radius) {
//     return { disbursed: false, reason: 'Outside impact radius' }
//   }

//   // Gate 3 — safety cap on pool total
//   const poolTotal    = await getPoolTotalSGD()
//   const maxPayout    = poolTotal * safety_cap
//   const proposedPayout = calculateSeverityPayout(disasterEvent.severity_score, poolTotal)
//   const finalPayout  = Math.min(proposedPayout, maxPayout)

//   return { disbursed: true, amount_sgd: finalPayout }
// }
