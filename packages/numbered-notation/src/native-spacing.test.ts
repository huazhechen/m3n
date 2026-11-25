import { describe, expect, it } from 'vitest'
import { solveNativeSpacing, type SpacingCell } from './native-spacing.js'
const cell = (lane = 'melody', overrides: Partial<SpacingCell> = {}): SpacingCell => ({ lane, left: 5, right: 5, before: 6, after: 6, ...overrides })
describe('native spacing constraints', () => {
  it('lets lyric prefixes use space under bars while retaining lyric clearance across empty slots', () => {
    const lyric = (left: number, right: number) => cell('lyric', { sparse: true, left, right, before: 0, after: 0, beforeStretch: 0, afterStretch: 0 })
    const music = () => cell('melody', { left: 5, right: 5, before: 0, after: 0 })
    const columns = [{ cells: [music(), lyric(8, 8)] }, { cells: [music()] }, { cells: [music(), lyric(30, 8)] }]
    const solved = solveNativeSpacing(columns)
    expect(solved.positions).toEqual([8, 18, 46])
    // The prefix can reach left of the intervening bar at x=18.
    expect(solved.positions[2]! - 30).toBeLessThan(solved.positions[1]!)
    // Both lyric boxes include the normal single-side padding.
    expect(solved.positions[2]! - 30).toBe(solved.positions[0]! + 8)
    for (const width of [solved.minimumWidth, 200]) {
      const filled = solveNativeSpacing(columns, width, true)
      expect(filled.positions[2]! - 30).toBeGreaterThanOrEqual(filled.positions[0]! + 8)
      expect(filled.positions[0]! - 8).toBeGreaterThanOrEqual(0)
      expect(filled.positions[2]! + 8).toBeLessThanOrEqual(width)
    }
  })
  it('preserves sparse lyric ink inside a rigid music group and after a trailing empty slot', () => {
    const music = () => cell('melody', { left: 5, right: 5, before: 0, after: 0 })
    const lyric = cell('lyric', { sparse: true, left: 30, right: 40, before: 0, after: 0, beforeStretch: 0, afterStretch: 0 })
    const columns = [{ cells: [music()], fixedAfter: 10 }, { cells: [music(), lyric] }, { cells: [music()] }]
    const solved = solveNativeSpacing(columns, 100, true)
    expect(solved.positions[1]! - solved.positions[0]!).toBe(10)
    expect(solved.positions[1]! - 30).toBeGreaterThanOrEqual(0)
    expect(solved.positions[1]! + 40).toBeLessThanOrEqual(100)
    expect(solved.positions[2]! + 5).toBeLessThanOrEqual(100)
  })
  it('retains each side clearance in unconstrained layout', () => {
    expect(solveNativeSpacing([{cells:[cell()]},{cells:[cell()]},{cells:[cell()]}])).toEqual({positions:[11,33,55],minimumWidth:66,stretchWeight:2})
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
    const minimum = solveNativeSpacing(columns).positions
    const filled = solveNativeSpacing(columns, 200, true).positions
    const growth = (i: number) => filled[i + 1]! - filled[i]! - minimum[i + 1]! + minimum[i]!
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
  it('does not invent neutral stretch weights for absent voices', () => {
    const slow = (lane = 'melody') => cell(lane, { beforeStretch: .25, afterStretch: .25 })
    const columns = [
      { cells: [slow(), slow('bass')] },
      { cells: [slow()] },
      { cells: [slow()] },
    ]
    expect(solveNativeSpacing(columns, 100, true).positions).toEqual([5, 50, 95])
  })
  it('shares surplus with bar edges while preserving rigid interiors', () => {
    const columns = [
      { cells: [cell()], fixedAfter: 10 },
      { cells: [cell('melody', { afterStretch: .5 })] },
      { cells: [cell('melody', { beforeStretch: .5 })] },
      { cells: [cell()] },
    ]
    const solve = (width: number) => solveNativeSpacing(columns, width, true, {left:true,right:true}).positions
    const a = solve(200), b = solve(300)
    const leftGrowth = b[0]! - a[0]!
    const growth = (i: number) => b[i+1]! - b[i]! - a[i+1]! + a[i]!
    expect(b[1]! - b[0]!).toBe(10)
    expect(growth(1) / leftGrowth).toBeCloseTo(.5, 10)
    expect(growth(2) / leftGrowth).toBeCloseTo(1, 10)
    expect((100 - (b.at(-1)! - a.at(-1)!)) / leftGrowth).toBeCloseTo(1, 10)
    expect(solveNativeSpacing([{cells:[cell()]}], 100, true, {left:true,right:true}).positions).toEqual([50])
  })
  it('keeps minimum clearances even when a supplied width cannot fit them', () => {
    const columns = Array.from({length:4},()=>({cells:[cell()]}))
    const result = solveNativeSpacing(columns,52)
    expect(result).toEqual({positions:[11,33,55,77],minimumWidth:88,stretchWeight:3})
    const filled = solveNativeSpacing(columns,52,true)
    expect(filled.positions).toEqual([5,27,49,71])
    expect(filled.positions.at(-1)! + 5).toBeGreaterThan(52)
  })
  it('reserves the widest simultaneous voice and aligns all voices to one column', () => {
    const result=solveNativeSpacing([{cells:[cell(),cell('bass',{left:20,right:15})]},{cells:[cell(),cell('bass')]}])
    expect(result.positions).toEqual([26,58])
    expect(result.minimumWidth).toBe(69)
  })
  it('does not copy another voice’s lyric expansion into an absent voice’s elastic placeholder', () => {
    const result = solveNativeSpacing([
      {cells:[cell('melody',{right:30}),cell('bass',{right:1})]},
      {cells:[cell('bass',{left:20,right:20,placeholderLeft:5,placeholderRight:5})]},
      {cells:[cell('melody'),cell('bass')]},
    ])
    expect(result.positions).toEqual([11,52,89])
    expect(result.minimumWidth).toBe(100)
  })
  it('preserves asymmetric attachment clearance and validates width', () => {
    const result=solveNativeSpacing([{cells:[cell('melody',{left:25})]},{cells:[cell()]}],100,true)
    expect(result.positions).toEqual([25,95])
    expect(()=>solveNativeSpacing([{cells:[cell()]}],0)).toThrow()
    expect(solveNativeSpacing([],100)).toEqual({positions:[],minimumWidth:0,stretchWeight:0})
  })
  it.each([52, 100, 300])('keeps rigid internal distances under minimum spacing and justification at %s', width => {
    const result = solveNativeSpacing([{cells:[cell()], fixedAfter:20}, {cells:[cell()], fixedAfter:15}, {cells:[cell()]}, {cells:[cell()]}], width, true)
    expect(result.positions[1]! - result.positions[0]!).toBeCloseTo(20, 8)
    expect(result.positions[2]! - result.positions[1]!).toBeCloseTo(15, 8)
    expect(result.positions[0]).toBeCloseTo(5, 8)
    expect(result.positions.at(-1)).toBeCloseTo(Math.max(width - 5, 62), 8)
  })
  it('reserves interior ink of every simultaneous lane in a rigid group', () => {
    const columns = [{cells:[cell(),cell('bass')],fixedAfter:20}, {cells:[cell(),cell('bass',{left:40,right:50})],fixedAfter:15}, {cells:[cell(),cell('bass')]}]
    const result = solveNativeSpacing(columns)
    expect(result.positions[1]! - 40).toBeGreaterThanOrEqual(0)
    expect(result.positions[1]! + 50).toBeLessThanOrEqual(result.minimumWidth)
    const followed = solveNativeSpacing([...columns,{cells:[cell(),cell('bass')]}])
    expect(followed.positions[3]! - 5).toBeGreaterThanOrEqual(followed.positions[1]! + 50)
  })

})
