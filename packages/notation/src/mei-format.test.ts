import { describe, expect, it } from 'vitest'
import { formatMeiXml } from './mei-format'

describe('formatMeiXml', () => {
  it('indents nested elements and keeps the declaration first', () => {
    const mei = '<?xml version="1.0"?><mei><music><body><section>'
      + '<measure n="1"><staff n="1"><layer n="1"><note xml:id="n1" pname="c" oct="4" dur="4"/></layer></staff></measure>'
      + '</section></body></music></mei>'

    expect(formatMeiXml(mei)).toBe([
      '<?xml version="1.0"?>',
      '<mei>',
      '  <music>',
      '    <body>',
      '      <section>',
      '        <measure n="1">',
      '          <staff n="1">',
      '            <layer n="1">',
      '              <note xml:id="n1" pname="c" oct="4" dur="4"/>',
      '            </layer>',
      '          </staff>',
      '        </measure>',
      '      </section>',
      '    </body>',
      '  </music>',
      '</mei>',
    ].join('\n'))
  })

  it('keeps inline text content on one line', () => {
    expect(formatMeiXml('<dir staff="1" startid="#n1">cresc.</dir>')).toBe(
      '<dir staff="1" startid="#n1">cresc.</dir>',
    )
  })
})
