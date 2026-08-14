export function isSimulatedSubmit() {
  const configured = import.meta.env.VITE_SUBMIT_MODE
  if (configured === 'local' || configured === 'remote') return configured === 'local'
  return import.meta.env.DEV
}
