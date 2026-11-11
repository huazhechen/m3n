export function scoreFileName(title: string) { 
  return title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'm3n-score'
}
