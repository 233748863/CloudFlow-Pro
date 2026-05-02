const DEFAULT_SITE_NAME = String(import.meta.env.VITE_APP_TITLE || 'CloudFlow Pro')
const DEFAULT_ICON_URL = String(import.meta.env.VITE_APP_ICON || '/icon.svg')

export function resolveDocumentTitle(routeTitle: unknown, siteName = DEFAULT_SITE_NAME): string {
  const normalizedSiteName = siteName.trim() || DEFAULT_SITE_NAME
  if (typeof routeTitle === 'string' && routeTitle.trim()) {
    return `${routeTitle.trim()} - ${normalizedSiteName}`
  }
  return normalizedSiteName
}

export function updateFavicon(iconUrl = DEFAULT_ICON_URL): void {
  const normalizedUrl = iconUrl.trim() || '/icon.svg'
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.type = normalizedUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon'
  link.href = normalizedUrl
}
