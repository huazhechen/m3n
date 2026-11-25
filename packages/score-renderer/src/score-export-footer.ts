export function scoreExportFooter(scoreUrl = 'https://score.cheesefans.com/') {
  return { text: `${new URL(scoreUrl).origin}/`, href: scoreUrl }
}
