/** Page that keeps the legacy app for the screens not migrated to React yet. */
export const LEGACY_PAGE_PATH = "/legado.html";

/** Legacy section ids that were renamed in the React landing. */
const RENAMED_SECTIONS: Record<string, string> = {
  portfolio: "trabalhos",
};

export function getHashRoute(hash: string): string {
  return hash.replace(/^#/, "");
}

/** Same rule as the legacy router (`path.startsWith('/meus' | '/admin')`) and the return script in legado.html. */
export function isLegacyRoute(hash: string): boolean {
  const path = (getHashRoute(hash) || "/").split("?")[0];
  return /^\/(meus|admin)/.test(path);
}

export function getLegacyPageUrl(hash: string): string {
  return `${LEGACY_PAGE_PATH}${hash}`;
}

/** Legacy section links look like `#/#servicos`; returns the React section id to scroll to. */
export function getLegacySectionId(hash: string): string | null {
  const route = getHashRoute(hash);
  if (!route.startsWith("/#")) return null;
  const section = route.split("#")[1];
  if (!section) return null;
  return RENAMED_SECTIONS[section] ?? section;
}

export function replaceLocation(url: string): void {
  window.location.replace(url);
}
