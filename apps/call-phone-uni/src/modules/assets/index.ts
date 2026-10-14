/** Public resource manifest only; credentials and provider URLs never enter the client. */
export interface AssetVariant { key: string; width?: number; height?: number }
export interface AssetEntry { id: string; version: number; variants: Record<string, AssetVariant> }
export interface AssetManifest { schemaVersion: number; resources: Record<string, AssetEntry> }
export interface AssetOptions { variant?: string; fallback?: string }

let manifest: AssetManifest = { schemaVersion: 1, resources: {} }
let publicBaseUrl = ''

export function configureAssets(config: { baseUrl: string; manifest?: AssetManifest }) {
  if (config.baseUrl && (!/^https?:\/\//.test(config.baseUrl) || /[?#]/.test(config.baseUrl))) {
    throw new Error('资源 baseUrl 需要不带查询参数的 HTTP(S) 地址')
  }
  if (config.manifest && config.manifest.schemaVersion !== 1) throw new Error('资源清单版本不兼容')
  publicBaseUrl = config.baseUrl.replace(/\/+$/, '')
  if (config.manifest) manifest = config.manifest
}

/** Missing configuration/resource returns a supplied packaged fallback or an empty string. */
export function resolveAsset(name: string, options: AssetOptions = {}): string {
  const resource = manifest.resources[name]
  const object = resource?.variants[options.variant || 'original']
  if (!publicBaseUrl || !object) return options.fallback || ''
  const parts = object.key.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\?#]/.test(part))) return options.fallback || ''
  return `${publicBaseUrl}/${parts.map(encodeURIComponent).join('/')}`
}
