export interface GitDiffTabInfo {
  file: string
  staged: boolean
  commit?: string
  base?: string
  label: string
  displayName: string
}

export function isGitDiffTab(tab?: string | null): boolean {
  if (!tab) return false
  return tab.startsWith("git-diff:")
}

export function makeGitDiffTab(
  file: string,
  staged = false,
  commit = "",
  base = "",
): string {
  const params = new URLSearchParams()
  if (staged) params.set("staged", "true")
  if (commit) params.set("commit", commit)
  if (base) params.set("base", base)
  const qs = params.toString()
  return qs ? `git-diff:${file}?${qs}` : `git-diff:${file}`
}

export function parseGitDiffTab(tab: string): GitDiffTabInfo | null {
  if (!isGitDiffTab(tab)) return null
  const raw = tab.slice("git-diff:".length)
  const [file, queryStr] = raw.split("?")
  const params = new URLSearchParams(queryStr || "")
  const staged = params.get("staged") === "true"
  const commit = params.get("commit") || undefined
  const base = params.get("base") || undefined

  const baseName = file.split("/").pop() || file
  let suffix = "(Working Tree)"
  if (base && commit) {
    suffix = `(${base.slice(0, 7)} ↔ ${commit.slice(0, 7)})`
  } else if (staged) {
    suffix = "(Index)"
  } else if (commit) {
    suffix = `(${commit.slice(0, 7)})`
  }

  return {
    file,
    staged,
    commit,
    base,
    label: `${baseName} ↔ ${suffix}`,
    displayName: `${baseName} ${suffix}`,
  }
}
