// A density of 1 means an average main-note column pitch of one music em.
export const reflowRatios = [0.98, 0.96, 0.94, 0.92, 0.90, 0.88, 0.86, 0.84, 0.82, 0.80, 0.78, 0.76]
export function crowding(layout) {
 const densities=layout.systemDensities??[]
 return Math.max(0,...densities) + Math.sqrt(densities.reduce((sum,d)=>sum+Math.max(0,d-1)**2,0)/Math.max(1,densities.length))
}
export function shouldTryReflow(layout) {
 return crowding(layout)>1 && layout.rows>=3
}
export function improvesReflow(original, candidate, maximumRows) {
 return candidate.rows<=maximumRows && candidate.rows>=original.rows
  && crowding(candidate)<crowding(original)*0.95
}

// The caller measures real geometry and supplies a page-count/capacity check.
// Never trade music size or vertical clearance for a lower horizontal density.
export async function reflowScorebookLayout(original, {measure, fits, extraRows=1}) {
 if(!shouldTryReflow(original))return original
 let best=original
 for(const ratio of reflowRatios) {
  const candidate=await measure(ratio)
  if(!candidate||candidate.rows>original.rows+extraRows||!fits(candidate))continue
  if(improvesReflow(original,candidate,original.rows+extraRows)
    && crowding(candidate)<crowding(best)-1e-6)best=candidate
 }
 return best
}
