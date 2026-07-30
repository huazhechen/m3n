import abcjs from 'abcjs'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import 'abcjs/abcjs-audio.css'

type ScoreRendererProps = {
  abc: string
  compact?: boolean
  activeRange?: { startChar: number; endChar: number } | null
  onActiveRange?: (range: { startChar?: number; endChar?: number } | null) => void
  onNoteClick?: (range: { startChar: number; endChar: number }) => void
  onPaperBlur?: () => void
  showPrintButton?: boolean
  onPrintClick?: () => void
}

export interface ScoreRendererRef {
  openExport: () => void
}

type PlaybackSource = {
  abc: string
  toOriginalPosition: (position: number) => number
}

type ExportFormat = 'png' | 'pdf'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function scoreFileName(abc: string) {
  const title = abc.match(/^T:(.+)$/m)?.[1]?.trim() || 'm3n-score'
  return title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'm3n-score'
}

function withoutBassStaff(abc: string) {
  let isBassVoice = false
  return abc
    .split('\n')
    .filter((line) => {
      if (/^%%score\b/.test(line)) {
        return false
      }
      if (/^V:bass\b/.test(line)) {
        isBassVoice = true
        return false
      }
      return !isBassVoice
    })
    .join('\n')
}

function getSvgSize(svg: SVGSVGElement, scale = 1) {
  const bounds = svg.getBoundingClientRect()
  const viewBox = svg.viewBox.baseVal
  const transformScale = Math.max(scale, 1)
  const width = viewBox.width || Number.parseFloat(svg.getAttribute('width') ?? '') / transformScale || bounds.width
  const height = viewBox.height || Number.parseFloat(svg.getAttribute('height') ?? '') / transformScale || bounds.height
  return { width, height }
}

function makeSvgResponsive(svg: SVGSVGElement, scale = 1) {
  const { width, height } = getSvgSize(svg, scale)
  if (width <= 0 || height <= 0) {
    return
  }
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet')
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.transform = ''
  svg.style.transformOrigin = ''
}

async function renderScoreCanvas(svg: SVGSVGElement, targetWidth: number, scale = 1) {
  const { width: sourceWidth, height: sourceHeight } = getSvgSize(svg, scale)
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('五线谱尺寸无效。')
  }

  const targetHeight = Math.ceil(targetWidth * sourceHeight / sourceWidth)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(sourceWidth))
  clone.setAttribute('height', String(sourceHeight))
  clone.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`)
  clone.style.background = '#fffef9'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法创建图片画布。')
    }
    context.fillStyle = '#fffef9'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function createPlaybackSource(abc: string): PlaybackSource {
  const lines = abc.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? []
  const header: string[] = []
  const segments = new Map<string, Array<{ value: string; originalStart: number }>>()
  let hasKey = false
  let partOrder: string[] | null = null
  let activePart: string | null = null
  let offset = 0

  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '')
    if (!hasKey) {
      if (!partOrder && /^P:/.test(content)) {
        partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      } else {
        header.push(line)
      }
      hasKey = /^K:/.test(content)
      offset += line.length
      continue
    }

    if (!partOrder && /^P:/.test(content) && /\s/.test(content.slice(2).trim())) {
      partOrder = content.slice(2).trim().split(/\s+/).filter(Boolean)
      offset += line.length
      continue
    }

    if (/^P:/.test(content)) {
      activePart = content.slice(2).trim()
      if (!segments.has(activePart)) {
        segments.set(activePart, [])
      }
      offset += line.length
      continue
    }

    if (activePart) {
      segments.get(activePart)?.push({ value: line, originalStart: offset })
    } else {
      header.push(line)
    }
    offset += line.length
  }

  if (!partOrder || partOrder.length === 0 || partOrder.some((part) => !segments.has(part))) {
    return { abc, toOriginalPosition: (position) => position }
  }

  const mappings: Array<{ playbackStart: number; playbackEnd: number; originalStart: number }> = []
  let expanded = header.join('')
  for (const part of partOrder) {
    if (expanded.length > 0 && !expanded.endsWith('\n')) {
      expanded += '\n'
    }
    expanded += `P:${part}\n`
    for (const chunk of segments.get(part) ?? []) {
      const playbackStart = expanded.length
      expanded += chunk.value
      mappings.push({
        playbackStart,
        playbackEnd: expanded.length,
        originalStart: chunk.originalStart,
      })
    }
  }

  return {
    abc: expanded,
    toOriginalPosition(position) {
      const mapping = mappings.find(
        (item) => position >= item.playbackStart && position <= item.playbackEnd,
      )
      return mapping ? mapping.originalStart + position - mapping.playbackStart : position
    },
  }
}

export const ScoreRenderer = forwardRef<ScoreRendererRef, ScoreRendererProps>(function ScoreRenderer({
  abc,
  compact = false,
  activeRange,
  onActiveRange,
  onNoteClick,
  onPaperBlur,
  showPrintButton = true,
  onPrintClick,
}: ScoreRendererProps, ref) {
  const paperRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLDivElement | null>(null)
  const exportDialogRef = useRef<HTMLDialogElement | null>(null)
  const exportPreviewRef = useRef<HTMLDivElement | null>(null)
  const synthControlRef = useRef<InstanceType<typeof abcjs.synth.SynthController> | null>(null)
  const playbackSpeedRef = useRef(100)

  useImperativeHandle(ref, () => ({
    openExport: () => {
      setIncludeBass(hasBassStaff)
      setIsExportDialogOpen(true)
      exportDialogRef.current?.showModal()
    },
  }))
  const appliedPlaybackSpeedRef = useRef(100)
  const pendingSeekRef = useRef<number | null>(null)
  const highlightedElementsRef = useRef<Element[]>([])
  const cursorElementsRef = useRef<Array<{ startChar: number; endChar: number; svgEl: SVGElement }>>([])
  const [message, setMessage] = useState('')
  const [staffWidth, setStaffWidth] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [playbackSpeed, setPlaybackSpeedValue] = useState(100)
  const [hasAudioControls, setHasAudioControls] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png')
  const [exportWidth, setExportWidth] = useState(1600)
  const [pdfScale, setPdfScale] = useState(100)
  const [includeBass, setIncludeBass] = useState(true)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const hasBassStaff = /^V:bass\b/m.test(abc)

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) {
      return
    }

    const updateWidth = () => {
      const width = Math.floor(paper.clientWidth)
      setStaffWidth((current) => (current === width ? current : width))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const paper = paperRef.current
    if (!paper) {
      return
    }

    paper.innerHTML = ''
    if (audioRef.current) {
      audioRef.current.innerHTML = ''
    }
    highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
    highlightedElementsRef.current = []
    cursorElementsRef.current = []
    onActiveRange?.(null)
    setMessage('')
    setPlaybackProgress(0)
    setHasAudioControls(false)
    synthControlRef.current = null
    pendingSeekRef.current = null

    try {
      const visualObjects = abcjs.renderAbc(paper, abc, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: Math.max(320, staffWidth || (compact ? 620 : 820)),
        wrap: {
          preferredMeasuresPerLine: 0,
          minSpacing: 1.5,
          minSpacingLimit: 1.25,
          maxSpacing: 2.5,
          lastLineLimit: 1.5,
        },
        // abcjs otherwise applies its default red selection before invoking clickListener.
        selectionColor: 'currentColor',
        clickListener(abcElem) {
          if (abcElem.el_type === 'note' && abcElem.startChar !== undefined && abcElem.endChar !== undefined) {
            paper.focus({ preventScroll: true })
            onNoteClick?.({ startChar: abcElem.startChar, endChar: abcElem.endChar })
          }
        },
        paddingtop: 16,
        paddingbottom: 16,
      })

      const visualObject = visualObjects[0]
      cursorElementsRef.current = visualObject?.getSelectableArray().flatMap((selectable) => {
        const { startChar, endChar } = selectable.absEl.abcelem
        return startChar === undefined || endChar === undefined
          ? []
          : [{ startChar, endChar, svgEl: selectable.svgEl }]
      }) ?? []
      if (!visualObject || !audioRef.current || !abcjs.synth.supportsAudio()) {
        return
      }

      const playbackSource = createPlaybackSource(abc)
      const playbackVisualObject = playbackSource.abc === abc
        ? visualObject
        : abcjs.renderAbc(document.createElement('div'), playbackSource.abc, {
            add_classes: true,
            staffwidth: Math.max(320, staffWidth || (compact ? 620 : 820)),
            paddingtop: 16,
            paddingbottom: 16,
          })[0]

      const synthControl = new abcjs.synth.SynthController()
      synthControlRef.current = synthControl
      synthControl.load(
        audioRef.current,
        {
          onBeat(beatNumber, totalBeats) {
            const progress = totalBeats > 0 ? Math.max(0, Math.min(1, beatNumber / totalBeats)) : 0
            setPlaybackProgress((current) => (Math.abs(current - progress) < 0.002 ? current : progress))
          },
          onReady() {
            const controller = synthControlRef.current
            const pendingSeek = pendingSeekRef.current
            if (controller && pendingSeek !== null) {
              controller.setProgress(pendingSeek)
              const playbackController = controller as unknown as { seek?: (percent: number) => void }
              playbackController.seek?.(pendingSeek)
              pendingSeekRef.current = null
            }
            if (controller && appliedPlaybackSpeedRef.current !== playbackSpeedRef.current) {
              appliedPlaybackSpeedRef.current = playbackSpeedRef.current
              controller.setWarp(playbackSpeedRef.current).catch(() => undefined)
            }
          },
          onEvent(event) {
            const startChars = event.startCharArray ?? (event.startChar === undefined ? [] : [event.startChar])
            const endChars = event.endCharArray ?? (event.endChar === undefined ? [] : [event.endChar])
            if (startChars.length === 0 || endChars.length === 0) {
              highlightedElementsRef.current.forEach((element) =>
                element.classList.remove('is-playing'),
              )
              highlightedElementsRef.current = []
              onActiveRange?.(null)
              return
            }
            if (event.milliseconds === 0) {
              setPlaybackProgress(0)
            }
            const ranges = startChars.map((startChar, index) => ({
              startChar: playbackSource.toOriginalPosition(startChar),
              endChar: playbackSource.toOriginalPosition(endChars[index] ?? endChars[0]),
            }))
            const elements = playbackVisualObject === visualObject
              ? event.elements?.flat().filter((element) => element instanceof Element) as Element[] ?? []
              : cursorElementsRef.current
                .filter((item) => ranges.some(
                  (range) => range.startChar < item.endChar && range.endChar > item.startChar,
                ))
                .map((item) => item.svgEl)
            highlightedElementsRef.current.forEach((element) => element.classList.remove('is-playing'))
            elements.forEach((element) => element.classList.add('is-playing'))
            highlightedElementsRef.current = elements
            onActiveRange?.(ranges[0])
          },
          onFinished() {
            highlightedElementsRef.current.forEach((element) =>
              element.classList.remove('is-playing'),
            )
            highlightedElementsRef.current = []
            onActiveRange?.(null)
            setPlaybackProgress(1)
          },
        },
        {
        displayLoop: false,
        displayRestart: false,
        displayPlay: true,
        displayProgress: false,
        displayWarp: false,
        },
      )
      setHasAudioControls(true)
      synthControl.setTune(playbackVisualObject, false, {
        soundFontUrl: '/soundfonts/FluidR3_GM/',
        soundFontVolumeMultiplier: 3,
      }).catch(() => {
        setMessage('当前浏览器需要用户交互后才能初始化音频。')
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ABC 渲染失败。')
    }
  }, [abc, compact, onActiveRange, onNoteClick, staffWidth])

  useEffect(() => {
    cursorElementsRef.current.forEach((item) => item.svgEl.classList.remove('is-cursor-active'))
    if (!activeRange) {
      return
    }

    cursorElementsRef.current.forEach((item) => {
      if (activeRange.startChar < item.endChar && activeRange.endChar > item.startChar) {
        item.svgEl.classList.add('is-cursor-active')
      }
    })
  }, [activeRange])

  useEffect(() => {
    if (!isExportDialogOpen) {
      return
    }
    const preview = exportPreviewRef.current
    if (!preview) {
      return
    }

    preview.innerHTML = ''
    const scale = exportFormat === 'pdf' ? pdfScale / 100 : 1
    const width = exportFormat === 'png' ? Math.max(320, exportWidth) : 1600
    abcjs.renderAbc(preview, includeBass || !hasBassStaff ? abc : withoutBassStaff(abc), {
      add_classes: false,
      staffwidth: width / scale,
      scale,
      wrap: {
        preferredMeasuresPerLine: 0,
        minSpacing: 1.5,
        minSpacingLimit: 1.25,
        maxSpacing: 2.5,
        lastLineLimit: 1.5,
      },
      paddingtop: 16,
      paddingbottom: 16,
    })
    preview.style.width = '100%'
    preview.style.height = 'auto'
    preview.style.overflow = 'visible'
    const previewSvg = preview.querySelector('svg')
    if (previewSvg) {
      makeSvgResponsive(previewSvg, scale)
      previewSvg.style.width = '100%'
      previewSvg.style.height = 'auto'
    }
  }, [abc, exportFormat, exportWidth, hasBassStaff, includeBass, isExportDialogOpen, pdfScale])

  const seekPlayback = (value: number) => {
    setPlaybackProgress(value)
    const synthControl = synthControlRef.current as (InstanceType<typeof abcjs.synth.SynthController> & {
      isLoaded?: boolean
    }) | null
    if (!synthControl) {
      return
    }

    if (synthControl.isLoaded) {
      synthControl.setProgress(value)
      const playbackController = synthControl as unknown as { seek?: (percent: number) => void }
      playbackController.seek?.(value)
      return
    }

    pendingSeekRef.current = value
    const playbackController = synthControl as unknown as {
      go?: () => Promise<unknown>
      isLoading?: boolean
    }
    if (!playbackController.isLoading) {
      playbackController.go?.().catch(() => {
        setMessage('当前浏览器无法初始化音频。')
      })
    }
  }

  const seekPlaybackFromPointer = (input: HTMLInputElement, clientX: number) => {
    const bounds = input.getBoundingClientRect()
    if (bounds.width === 0) {
      return
    }
    seekPlayback(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)))
  }

  const setPlaybackSpeed = (value: number) => {
    setPlaybackSpeedValue(value)
    playbackSpeedRef.current = value
    const synthControl = synthControlRef.current as (InstanceType<typeof abcjs.synth.SynthController> & {
      isLoaded?: boolean
    }) | null
    if (synthControl?.isLoaded) {
      appliedPlaybackSpeedRef.current = value
      synthControl.setWarp(value).catch(() => undefined)
    }
  }

  const internalOpenExportDialog = () => {
    setIncludeBass(hasBassStaff)
    setIsExportDialogOpen(true)
    exportDialogRef.current?.showModal()
  }

  const exportScore = async () => {
    setIsExporting(true)
    setMessage('')
    try {
      const fileName = scoreFileName(abc)
      const scale = exportFormat === 'pdf' ? pdfScale / 100 : 1
      if (exportFormat === 'pdf' && (!Number.isFinite(scale) || scale < 0.5 || scale > 2)) {
        throw new Error('PDF 缩放需介于 50% 和 200% 之间。')
      }
      const staffwidth = exportFormat === 'png' ? Math.max(320, exportWidth) : 1600 / scale
      const exportPaper = document.createElement('div')
      const [visualObject] = abcjs.renderAbc(
        exportPaper,
        includeBass || !hasBassStaff ? abc : withoutBassStaff(abc),
        {
          add_classes: false,
          staffwidth: staffwidth / scale,
          scale,
          wrap: {
            preferredMeasuresPerLine: 0,
            minSpacing: 1.5,
            minSpacingLimit: 1.25,
            maxSpacing: 2.5,
            lastLineLimit: 1.5,
          },
          paddingtop: 16,
          paddingbottom: 16,
        },
      )
      const svg = exportPaper.querySelector('svg')
      if (!visualObject || !svg) {
        throw new Error('当前没有可导出的五线谱。')
      }
      if (exportFormat === 'png') {
        const width = Math.round(exportWidth)
        if (!Number.isFinite(width) || width < 320 || width > 8000) {
          throw new Error('PNG 宽度需介于 320 和 8000 像素之间。')
        }
        const canvas = await renderScoreCanvas(svg, width, scale)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!blob) {
          throw new Error('PNG 生成失败。')
        }
        downloadBlob(blob, `${fileName}.png`)
      } else {
        const canvas = await renderScoreCanvas(svg, 1600, scale)
        const documentWidth = 210
        const documentHeight = 297
        const margin = 10
        const contentWidth = documentWidth - margin * 2
        const contentHeight = documentHeight - margin * 2
        const imageWidth = contentWidth
        const sourcePageHeight = Math.floor(canvas.width * contentHeight / imageWidth)
        const { jsPDF } = await import('jspdf')
        const pdf = new jsPDF({ format: 'a4', unit: 'mm' })

        for (let offset = 0, page = 0; offset < canvas.height; offset += sourcePageHeight, page += 1) {
          if (page > 0) {
            pdf.addPage('a4', 'portrait')
          }
          const pageHeight = Math.min(sourcePageHeight, canvas.height - offset)
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = pageHeight
          const context = pageCanvas.getContext('2d')
          if (!context) {
            throw new Error('无法创建 PDF 页面。')
          }
          context.fillStyle = '#fffef9'
          context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
          context.drawImage(canvas, 0, -offset)
          const imageHeight = pageHeight * imageWidth / canvas.width
          pdf.addImage(pageCanvas, 'PNG', (documentWidth - imageWidth) / 2, margin, imageWidth, imageHeight, undefined, 'FAST')
        }
        pdf.save(`${fileName}.pdf`)
      }
      exportDialogRef.current?.close()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败。')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className={compact ? 'score-card compact' : 'score-card'}>
      <div
        ref={paperRef}
        className="score-paper"
        tabIndex={0}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            onPaperBlur?.()
          }
        }}
      />
      <div className="audio-controls">
        <div ref={audioRef} />
        {hasAudioControls && (
          <div className="playback-speed">
            <span>速度</span>
            <input
              type="range"
              min="50"
              max="200"
              step="5"
              value={playbackSpeed}
              aria-label="Playback speed"
              onChange={(event) => setPlaybackSpeed(Number(event.currentTarget.value))}
            />
            <output>{playbackSpeed}%</output>
          </div>
        )}
        {hasAudioControls && (
          <div className="playback-progress">
            <span>播放进度</span>
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(playbackProgress * 1000)}
            aria-label="Playback position"
            onInput={(event) => seekPlayback(Number(event.currentTarget.value) / 1000)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              seekPlaybackFromPointer(event.currentTarget, event.clientX)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                seekPlaybackFromPointer(event.currentTarget, event.clientX)
              }
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
          />
            <output>{Math.round(playbackProgress * 100)}%</output>
          </div>
        )}
        {showPrintButton && (
          <button type="button" className="action-button" onClick={onPrintClick ?? internalOpenExportDialog}>
            打印
          </button>
        )}
      </div>
      <dialog
        ref={exportDialogRef}
        className="export-dialog"
        onClose={() => setIsExportDialogOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void exportScore()
          }}
        >
          <div className="export-header">
            <h2>打印五线谱</h2>
            <span>{exportFormat === 'pdf' ? 'A4 纵向' : 'PNG 图片'}</span>
          </div>
          <div className="export-content">
            <div className="export-settings">
              <fieldset>
                <legend>格式</legend>
                <label>
                  <input
                    type="radio"
                    name="export-format"
                    checked={exportFormat === 'png'}
                    onChange={() => setExportFormat('png')}
                  />
                  PNG 图片
                </label>
                <label>
                  <input
                    type="radio"
                    name="export-format"
                    checked={exportFormat === 'pdf'}
                    onChange={() => setExportFormat('pdf')}
                  />
                  PDF（A4）
                </label>
              </fieldset>
              {hasBassStaff && (
                <fieldset>
                  <legend>低音谱表</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={includeBass}
                      onChange={(event) => setIncludeBass(event.currentTarget.checked)}
                    />
                    包含低音谱表
                  </label>
                </fieldset>
              )}
              {exportFormat === 'png' ? (
                <label className="export-field">
                  宽度
                  <input
                    type="number"
                    min="320"
                    max="8000"
                    step="10"
                    value={exportWidth}
                    onChange={(event) => setExportWidth(Number(event.currentTarget.value))}
                  />
                  <span>px</span>
                </label>
              ) : (
                <label className="export-field">
                  缩放
                  <input
                    type="number"
                    min="50"
                    max="200"
                    step="1"
                    value={pdfScale}
                    onChange={(event) => setPdfScale(Number(event.currentTarget.value))}
                  />
                  <span>%</span>
                </label>
              )}
            </div>
            <div className="export-preview" aria-label="打印预览">
              <div ref={exportPreviewRef} className="export-preview-paper" />
            </div>
          </div>
          <div className="export-actions">
            <button type="button" onClick={() => exportDialogRef.current?.close()} disabled={isExporting}>
              取消
            </button>
            <button type="submit" disabled={isExporting}>
              {isExporting ? '正在生成' : '确认并下载'}
            </button>
          </div>
        </form>
      </dialog>
      {message && <p className="render-message">{message}</p>}
    </section>
  )
})
