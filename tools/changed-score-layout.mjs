import { probeWidthCandidates } from './scorebook-width.mjs'
import { measure } from './scorebook-layout.mjs'

export async function searchNumbered(source) {
  document.body.innerHTML = '<div id="scratch"></div>'
  await measure(source, 720, true)
  return probeWidthCandidates(width => measure(source, width, true))
}
