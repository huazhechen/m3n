/** Wraps each top-level score SVG into a sheet container so on-screen pagination matches print layout. */
export function wrapScorePagesIntoSheets(paper: HTMLElement, sheetClassName: string) {
  paper.querySelectorAll<SVGSVGElement>(':scope > svg').forEach((svg) => {
    const sheet = document.createElement('div')
    sheet.className = sheetClassName
    svg.replaceWith(sheet)
    sheet.append(svg)
  })
}
