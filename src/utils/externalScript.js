// Reutiliza la promesa por URL para que vistas montadas a la vez no inserten
// varias etiquetas <script> del mismo recurso en el documento.
const scriptLoads = new Map()

/**
 * Carga un script externo una sola vez y verifica que registre la global
 * esperada antes de resolver. Los errores de red o de inicialización se
 * propagan al componente que solicitó el recurso.
 */
export function loadExternalScript(src, globalName) {
  if (window[globalName]) return Promise.resolve()
  if (scriptLoads.has(src)) return scriptLoads.get(src)

  const load = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      if (window[globalName]) resolve()
      else reject(new Error(`El script ${src} no expuso ${globalName}`))
    }
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    document.head.appendChild(script)
  })
  scriptLoads.set(src, load)
  return load
}
