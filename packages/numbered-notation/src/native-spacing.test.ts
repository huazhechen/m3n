import { describe, expect, it } from 'vitest'
import { solveNativeSpacing, type SpacingCell } from './native-spacing.js'
const cell = (lane = 'melody', overrides: Partial<SpacingCell> = {}): SpacingCell => ({ lane, left: 5, right: 5, before: 6, after: 6, beforeStiffness: 1 / 6, afterStiffness: 1 / 6, beforeCollision: 16, afterCollision: 16, ...overrides })
describe('native spacing constraints', () => {
  it('retains each side clearance in unconstrained layout', () => {
    expect(solveNativeSpacing([{cells:[cell()]},{cells:[cell()]},{cells:[cell()]}])).toEqual({positions:[11,33,55],naturalWidth:66})
  })
  it('spreads surplus equally across free columns and keeps outer ink flush', () => {
    expect(solveNativeSpacing(Array.from({length:3},()=>({cells:[cell()]})),100,true).positions).toEqual([5,50,95])
  })
  it('allocates positive surplus by beam weights and preserves rigid offsets', () => {
    const columns = [
      { cells: [cell()], fixedAfter: 10 },
      { cells: [cell('melody', { afterStretch: .5 })] },
      { cells: [cell('melody', { beforeStretch: .5 })] },
      { cells: [cell()] },
    ]
    const natural = solveNativeSpacing(columns).positions
    const filled = solveNativeSpacing(columns, 200, true).positions
    const growth = (i: number) => filled[i + 1]! - filled[i]! - natural[i + 1]! + natural[i]!
    expect(filled[1]! - filled[0]!).toBe(10)
    expect(growth(1) / growth(2)).toBeCloseTo(.5, 10)
    expect(filled[0]).toBe(5)
    expect(filled.at(-1)).toBe(195)
  })
  it('uses the largest voice weight for a shared gap', () => {
    const columns = [
      { cells: [cell('melody', { afterStretch: .5 }), cell('bass')] },
      { cells: [cell('melody', { beforeStretch: .5 }), cell('bass')] },
      { cells: [cell(), cell('bass')] },
    ]
    expect(solveNativeSpacing(columns, 100, true).positions).toEqual([5, 50, 95])
  })
  it('compresses elastic space before intruding into ink', () => {
    const positions = solveNativeSpacing(Array.from({length:4},()=>({cells:[cell()]})),52).positions
    expect(positions[0]).toBeGreaterThanOrEqual(4.9)
    expect(positions.at(-1)!).toBeLessThanOrEqual(47.1)
    for(let i=1;i<positions.length;i++)expect(positions[i]!-positions[i-1]!).toBeGreaterThanOrEqual(9.9)
    expect(positions[0]!+positions.at(-1)!).toBeCloseTo(52,4)
  })
  it('reserves the widest simultaneous voice and aligns all voices to one column', () => {
    const result=solveNativeSpacing([{cells:[cell(),cell('bass',{left:20,right:15})]},{cells:[cell(),cell('bass')]}])
    expect(result.positions).toEqual([26,58])
    expect(result.naturalWidth).toBe(69)
  })
  it('does not copy another voice’s lyric expansion into an absent voice’s elastic placeholder', () => {
    const result = solveNativeSpacing([
      {cells:[cell('melody',{right:30}),cell('bass',{right:1})]},
      {cells:[cell('bass',{left:20,right:20,placeholderLeft:5,placeholderRight:5})]},
      {cells:[cell('melody'),cell('bass')]},
    ])
    expect(result.positions).toEqual([11,52,89])
    expect(result.naturalWidth).toBe(100)
  })
  it('preserves asymmetric attachment clearance and validates width', () => {
    const result=solveNativeSpacing([{cells:[cell('melody',{left:25})]},{cells:[cell()]}],100,true)
    expect(result.positions).toEqual([25,95])
    expect(()=>solveNativeSpacing([{cells:[cell()]}],0)).toThrow()
    expect(solveNativeSpacing([],100)).toEqual({positions:[],naturalWidth:0})
  })
  it.each([52, 100, 300])('keeps rigid internal distances under compression and justification at %s', width => {
    const result = solveNativeSpacing([{cells:[cell()], fixedAfter:20}, {cells:[cell()], fixedAfter:15}, {cells:[cell()]}, {cells:[cell()]}], width, true)
    expect(result.positions[1]! - result.positions[0]!).toBeCloseTo(20, 8)
    expect(result.positions[2]! - result.positions[1]!).toBeCloseTo(15, 8)
    expect(result.positions[0]).toBeCloseTo(5, 8)
    expect(result.positions.at(-1)).toBeCloseTo(width - 5, 8)
  })
  it('reserves interior ink of every simultaneous lane in a rigid group', () => {
    const columns = [{cells:[cell(),cell('bass')],fixedAfter:20}, {cells:[cell(),cell('bass',{left:40,right:50})],fixedAfter:15}, {cells:[cell(),cell('bass')]}]
    const result = solveNativeSpacing(columns)
    expect(result.positions[1]! - 40).toBeGreaterThanOrEqual(0)
    expect(result.positions[1]! + 50).toBeLessThanOrEqual(result.naturalWidth)
    const followed = solveNativeSpacing([...columns,{cells:[cell(),cell('bass')]}])
    expect(followed.positions[3]! - 5).toBeGreaterThanOrEqual(followed.positions[1]! + 50)
  })

})
