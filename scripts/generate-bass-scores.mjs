import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const scoreDir = join(process.cwd(), 'src', 'scores')
mkdirSync(scoreDir, { recursive: true })

const keys = ['C', 'G', 'D', 'F', 'Bb', 'A', 'E', 'Am', 'Em', 'Dm']
const meters = ['4/4', '4/4', '4/4', '3/4']
const tempi = [72, 84, 96, 108, 120, 132, 144]
const dynamics = ['mp', 'mf', 'p', 'f']

const styles = [
  {
    name: 'Sonatina',
    subtitle: 'K545-style right hand passagework with independent Alberti bass',
    composer: 'Classical study after Mozart',
    category: 'Advanced Bass Studies',
    progressions: [
      [1, 5, 6, 3, 4, 1, 2, 5],
      [1, 4, 2, 5, 1, 6, 4, 5],
    ],
  },
  {
    name: 'Nocturne',
    subtitle: 'cantabile melody with broken-chord bass and inner suspensions',
    composer: 'Romantic study',
    category: 'Advanced Bass Studies',
    progressions: [
      [1, 6, 4, 5, 3, 6, 2, 5],
      [1, 3, 4, 2, 5, 6, 4, 5],
    ],
  },
  {
    name: 'Invention',
    subtitle: 'two-voice counterpoint study with moving bass',
    composer: 'Baroque study',
    category: 'Advanced Bass Studies',
    progressions: [
      [1, 5, 6, 3, 4, 2, 5, 1],
      [1, 2, 5, 6, 4, 3, 2, 5],
    ],
  },
  {
    name: 'Waltz',
    subtitle: 'lyrical treble line with oom-pah-pah bass',
    composer: 'Dance study',
    category: 'Advanced Bass Studies',
    progressions: [
      [1, 5, 6, 3, 4, 1, 2, 5],
      [1, 4, 5, 1, 6, 2, 5, 1],
    ],
  },
]

const degreePools = {
  1: [1, 3, 5, 1, 2, 3, 5, 6],
  2: [2, 4, 6, 2, 1, 4, 5, 7],
  3: [3, 5, 7, 3, 2, 5, 6, 1],
  4: [4, 6, 1, 4, 3, 6, 2, 1],
  5: [5, 7, 2, 5, 4, 7, 1, 2],
  6: [6, 1, 3, 6, 5, 1, 2, 4],
  7: [7, 2, 4, 7, 6, 2, 3, 5],
}

function pad(number) {
  return String(number).padStart(4, '0')
}

function rotate(values, amount) {
  return values.map((_, index) => values[(index + amount) % values.length])
}

function degree(value) {
  return ((value - 1 + 7) % 7) + 1
}

function high(value, amount = 1) {
  return `${degree(value)}${'e'.repeat(amount)}`
}

function low(value, amount = 1) {
  return `${degree(value)}${'d'.repeat(amount)}`
}

function chord(root, octave = '') {
  return `[${degree(root)}${octave} ${degree(root + 2)}${octave} ${degree(root + 4)}${octave}:h]`
}

function eighthPair(a, b) {
  return `(${a} ${b})`
}

function barLine(index) {
  return (index + 1) % 4 === 0 ? ' |{br}' : ' |'
}

function melodyBar(root, index, variant, meter) {
  const pool = rotate(degreePools[degree(root)], (index + variant) % 8)
  const turn = variant % 3 === 0 ? `${degree(pool[4])}#` : degree(pool[4])

  if (meter === '3/4') {
    if (index % 4 === 3) {
      return `${chord(root)} ${eighthPair(degree(root + 4), degree(root + 3))} ${degree(root + 2)}^`
    }
    return `${eighthPair(pool[0], pool[1])} ${eighthPair(pool[2], high(pool[3]))} ${degree(pool[4])}^`
  }

  switch ((index + variant) % 5) {
    case 0:
      return `${eighthPair(pool[0], pool[1])} ${eighthPair(pool[2], high(pool[3]))} ${eighthPair(high(pool[4]), high(pool[5]))} ${eighthPair(high(pool[6]), pool[7])}`
    case 1:
      return `${chord(root)} ${eighthPair(pool[2], turn)} ${eighthPair(high(pool[5]), high(pool[4]))} ${degree(root + 4)}^`
    case 2:
      return `{lg}${eighthPair(pool[0], pool[2])} ${eighthPair(high(pool[4]), high(pool[5]))}{/} ${eighthPair(high(pool[3]), pool[1])} ${eighthPair(pool[2], pool[0])}`
    case 3:
      return `${degree(root + 4)} ${eighthPair(degree(root + 3), degree(root + 2))} ${eighthPair(pool[1], pool[2])} ${high(root)}^`
    default:
      return `${eighthPair(pool[0], pool[1])} ${chord(root + 2)} ${eighthPair(pool[5], pool[4])} ${degree(root)}^`
  }
}

function bassBar(root, index, variant, meter) {
  const third = degree(root + 2)
  const fifth = degree(root + 4)

  if (meter === '3/4') {
    if ((index + variant) % 2 === 0) {
      return `${chord(root, 'd')} ${chord(root + 2, 'd')} ${chord(root + 4, 'd')}`
    }
    return `${low(root, 2)} ${chord(root + 4, 'd')} ${chord(root + 2, 'd')}`
  }

  switch ((index + variant) % 4) {
    case 0:
      return `${eighthPair(low(root, 2), low(fifth))} ${eighthPair(low(third), low(fifth))} ${eighthPair(low(root), third)} ${eighthPair(fifth, third)}`
    case 1:
      return `${chord(root, 'd')} ${low(fifth)} ${chord(third, 'd')} ${low(fifth)}`
    case 2:
      return `${low(root, 2)} ${eighthPair(low(fifth), low(third))} ${low(fifth)} ${eighthPair(low(root), low(fifth))}`
    default:
      return `${eighthPair(low(root, 2), low(third))} ${eighthPair(low(fifth), low(root))} ${chord(root, 'd')} ${low(fifth)}`
  }
}

function writeScore(index) {
  const style = styles[index % styles.length]
  const key = keys[index % keys.length]
  const meter = meters[(index + Math.floor(index / 13)) % meters.length]
  const tempo = tempi[(index * 3) % tempi.length]
  const dynamic = dynamics[index % dynamics.length]
  const progression = rotate(style.progressions[index % style.progressions.length], index % 8)
  const bars = meter === '3/4' ? 24 : 16
  const slug = `advanced-bass-study-${pad(index + 1)}`
  const title = `${style.name} Bass Study No. ${pad(index + 1)}`

  const melody = []
  const bass = []
  for (let bar = 0; bar < bars; bar += 1) {
    const root = progression[bar % progression.length]
    melody.push(`${melodyBar(root, bar, index, meter)}${barLine(bar)}`)
    bass.push(`${bassBar(root, bar, index, meter)}${barLine(bar)}`)
  }

  melody[melody.length - 1] = melody[melody.length - 1].replace(/\s\|\{br\}$|\s\|$/, ' |||')
  bass[bass.length - 1] = bass[bass.length - 1].replace(/\s\|\{br\}$|\s\|$/, ' |||')

  const source = [
    `{title=${title}} {subtitle=${style.subtitle}}`,
    `{composer=${style.composer}} {category=${style.category}}`,
    `{key=${key}} {${meter}} {tempo=${tempo}bpm}`,
    `{${dynamic}} ${melody.join('\n')}`,
    '',
    '{bass}',
    bass.join('\n'),
    '{/}',
    '',
  ].join('\n')

  writeFileSync(join(scoreDir, `${slug}.m3n`), source, 'utf8')
}

for (let index = 0; index < 1000; index += 1) {
  writeScore(index)
}
