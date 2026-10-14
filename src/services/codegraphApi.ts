/**
 * CodeGraph VantageCraft API Service
 *
 * Interacts with the native @colbymchenry/codegraph UI Server Reverse Proxy
 * mounted at `/api/codegraph/ui/*`.
 */

export type NodeKind = "function" | "method" | "class" | "interface" | "struct" | "type_alias" | "variable" | "constant" | "file" | "directory" | "module" | "route" | "component" | "hook" | "property" | "field" | "import" | "export" | string

export type EdgeKind = "calls" | "imports" | "exports" | "defines" | "implements" | "extends" | "references" | "instantiates" | "navigates" | "renders" | "handles" | string

export type Language = "go" | "typescript" | "javascript" | "python" | "rust" | "tsx" | "jsx" | string

export interface WireNodeRef {
  id: string
  kind: NodeKind
  name: string
  qualifiedName: string
  file: string
  line: number
  endLine: number
  language: Language
  signature?: string
  exported?: boolean
  test: boolean
  generated?: boolean
}

export interface WireNodeDetail extends WireNodeRef {
  startColumn: number
  endColumn: number
  docstring?: string
  visibility?: string
  async?: boolean
  static?: boolean
  abstract?: boolean
  decorators?: string[]
  typeParameters?: string[]
  returnType?: string
  lines: number
}

export interface WireEdge {
  kind: EdgeKind
  line?: number
  col?: number
  confidence?: number
  resolvedBy?: string
  provenance?: string
  synthesizedBy?: string
  via?: string
  registeredAt?: string
  valueRef?: boolean
  when?: string
}

export interface WireRelation {
  node: WireNodeRef
  edgeKinds: EdgeKind[]
  edges: WireEdge[]
  edgeCount: number
  lines: number[]
  confidence: number | null
  uncertain: boolean
  synthesized: boolean
  fanIn?: number
  hub?: boolean
}

export interface WireList<T> {
  total: number
  shown: number
  truncated: boolean
  items: T[]
}

// ── Entrypoints Types ──

export interface WireRoute {
  id: string
  path: string
  method: string
  file: string
  line: number
  framework?: string
  handler?: WireNodeRef | null
}

export interface WireEntryFile extends WireNodeRef {
  calls: number
  reaches: number
  dependents: number
}

export interface WireEntryTest extends WireNodeRef {
  reaches: number
  refs: number
}

export interface WireEntryHub extends WireNodeRef {
  dependents: number
}

export interface WireEntryPoints {
  frameworks: string[]
  routes: {
    routed: boolean
    routeCount: number
    items: WireList<WireRoute>
  }
  files: WireList<WireEntryFile>
  tests: WireList<WireEntryTest>
  hubs: WireList<WireEntryHub>
  index: {
    lastIndexedAt: number | null
    files: number
  }
  timing: {
    elapsedMs: number
    cached: boolean
  }
}

// ── Steps Types ──

export type WireStepKind = "anchor" | "screen" | "trigger" | "bridge" | "event" | "store" | "effect"
export type WireStepLinkKind = "calls" | "navigates" | "handler" | "bridge" | "event" | "store" | "effect"

export interface WireStepDecision {
  branch: string
  on: string
  arm: string
  form: "if" | "switch" | "ternary" | "try"
  not?: boolean
}

export interface WireStepTrigger {
  event?: string
  in: string
}

export interface WireStepSite {
  file: string
  line: number
  text: string
  args?: string
  when: string
  trigger?: WireStepTrigger
  status?: number
  decision?: WireStepDecision
}

export interface WireStep {
  id: string
  kind: WireStepKind
  anchor: boolean
  node: WireNodeRef | null
  label: string
  sub: string
  depth: number
  cut: "depth" | "fan-out" | "folded" | "steps" | "screen" | "component" | null
  event?: string
  events?: string[]
  trigger?: WireStepTrigger
  order?: number
  region?: {
    id: string
    label: string
  }
  screen?: {
    path: string
    component: WireNodeRef | null
    endpoint: boolean
    inline: boolean
  }
  effect?: {
    api: string
    apis: string[]
    category: string
    by: WireNodeRef
    line: number
    model?: string
    access?: "read" | "write"
    statuses?: number[]
  }
}

export interface WireStepLink {
  id: string
  from: string
  to: string
  kind: WireStepLinkKind
  via: WireNodeRef[]
  when: string
  label: string
  within?: string
  synthesized: boolean
  uncertain: boolean
  sites: WireStepSite[]
  trigger?: WireStepTrigger
}

export interface WireProgram {
  root: WireNodeRef
  lines: Array<{
    line: number
    text: string
    stepId?: string
  }>
}

export interface WireStepsPayload {
  anchor: WireNodeRef
  ambiguous: WireNodeRef[]
  project: "app" | "api" | "web"
  steps: WireStep[]
  links: WireStepLink[]
  program: WireProgram | null
  defaultView: "order" | "tree"
  depth: number
  limit: number
  through: boolean
  truncated: {
    steps: number
    hubs: number
    chrome: number
  }
  index: {
    lastIndexedAt: number | null
    edges: number
    files: number
  }
  timing: {
    elapsedMs: number
  }
}

// ── Map Types ──

export interface WireMapModule {
  id: string
  label: string
  files: number
  symbols: number
  languages: Array<{
    language: Language
    files: number
  }>
  test: boolean
  generated: number
  generatedFiles: string[]
  facade: boolean
  fileList: WireList<string>
  dependents: {
    files: number
    modules: number
  }
}

export interface WireMapLink {
  source: string
  target: string
  count: number
  declared: number
  byKind: Array<{
    kind: EdgeKind
    count: number
  }>
  topPairs: Array<{
    from: string
    to: string
    count: number
    declared: number
  }>
}

export interface WireMapCycle {
  size: number
  files: string[]
  modules: string[]
}

export interface WireMapPayload {
  root: string
  depth: number
  roots: Array<{
    root: string
    label: string
    files: number
  }>
  modules: WireMapModule[]
  links: WireMapLink[]
  cycles: {
    total: number
    shown: number
    truncated: boolean
    items: WireMapCycle[]
  }
  excluded: {
    uncertainEdges: number
    confidenceBelow: number
  }
  index: {
    lastIndexedAt: number | null
    edges: number
    files: number
  }
  timing: {
    elapsedMs: number
    cached: boolean
  }
}

// ── Flow Types ──

export interface WireFlowEdge extends WireEdge {
  label: string
  upward: boolean
  uncertain: boolean
  synthesized: boolean
}

export interface WireFlowSource {
  file: string
  language: string
  from: number
  to: number
  lines?: string[]
  drift: boolean
  reason?: string
}

export interface WireFlowCallRef {
  line: number
  col: number | null
  name: string
  targetId: string
  backwards: boolean
}

export interface WireFlowHop {
  node: WireNodeRef
  edge: WireFlowEdge | null
  callRef: WireFlowCallRef | null
  source: WireFlowSource | null
}

export interface WireFlowBoundary {
  node: WireNodeRef
  uncertain: WireList<{
    node: WireNodeRef
    line: number | null
    confidence: number | null
  }>
  further: WireList<{
    node: WireNodeRef
    line: number | null
    confidence: number | null
  }>
  missed: WireNodeRef[]
}

export interface WireFlow {
  id: string
  label: string
  hops: WireFlowHop[]
  boundary: WireFlowBoundary | null
  partial: boolean
}

export interface WireFlowPayload {
  query: {
    kind: "directed" | "symbols" | "trail"
    from: string | null
    to: string | null
    symbols: string[]
  }
  flows: WireFlow[]
  ambiguous: Array<{
    token: string
    chosen: WireNodeRef | null
    others: WireNodeRef[]
  }>
  unresolved: string[]
  reason: string | null
  index: {
    lastIndexedAt: number | null
    edges: number
    files: number
  }
  timing: {
    elapsedMs: number
  }
}

// ── Screens Types ──

export interface WireScreen {
  id: string
  path: string
  file: string
  line: number
  component: WireNodeRef | null
  incoming: number
  outgoing: number
}

export interface WireScreenOrigin {
  id: string
  node: WireNodeRef
  outgoing: number
  sharedBy?: number
}

export interface WireScreenSite {
  file: string
  line: number
  href: string
  method: string
  when: string
}

export interface WireScreenLink {
  id: string
  from: string
  to: string
  fromOrigin: boolean
  via: WireNodeRef[]
  when: string
  sites: WireScreenSite[]
  synthesized: boolean
}

export interface WireScreensPayload {
  routed: boolean
  entry: string | null
  screens: WireScreen[]
  origins: WireScreenOrigin[]
  links: WireScreenLink[]
  dropped: number
  index: {
    lastIndexedAt: number | null
    edges: number
    files: number
  }
  timing: {
    elapsedMs: number
  }
}

// ── FileCode Types ──

export interface WireFileOutsideRef {
  line: number
  col: number
  name: string
  kind: string
}

export interface WireFileCall {
  ownerId: string
  ownerLine: number
  relation: WireRelation
}

export interface WireFileCodePayload {
  file: {
    path: string
    language: string
    size: number
    indexedAt: number
    contentHash: string
    generated: boolean
    test: boolean
    errors: string[]
    id: string | null
    totalLines: number | null
  }
  drift: boolean
  reason?: string
  outline: WireList<WireNodeRef>
  calls: WireList<WireFileCall>
  outside: WireList<WireFileOutsideRef>
  intraFileCalls: number
  timing: {
    elapsedMs: number
  }
}

export interface LanguageStat {
  language: string
  files: number
}

export interface WireStats {
  files?: number
  nodes?: number
  edges?: number
  languages?: LanguageStat[]
  lastIndexedAt?: number | null
  version?: string
  state?: "ready" | "indexing" | "unindexed" | "stale" | "error"
  status?: string
  [key: string]: any
}

// ── Client Fetchers ──

export const CODEGRAPH_ROUTES = {
  BASE: "/api/codegraph/ui",
  STATS: "/api/codegraph/ui/stats",
  INIT: "/api/codegraph/ui/init",
  INDEX: "/api/codegraph/ui/index",
  SYNC: "/api/codegraph/ui/sync",
  ENTRYPOINTS: "/api/codegraph/ui/entrypoints",
  STEPS: "/api/codegraph/ui/steps",
  MAP: "/api/codegraph/ui/map",
  FLOW: "/api/codegraph/ui/flow",
  SCREENS: "/api/codegraph/ui/screens",
  FILECODE: (filePath: string) =>
    `/api/codegraph/ui/filecode/${encodeURIComponent(filePath.replace(/^\/+/, ""))}`,
  NODE: (id: string) => `/api/codegraph/ui/node/${encodeURIComponent(id)}`,
  SEARCH: (query: string) =>
    `/api/codegraph/ui/search?q=${encodeURIComponent(query)}`,
} as const

export async function fetchStats(
  signal?: AbortSignal,
): Promise<WireStats | null> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.STATS, { signal })
    if (res.ok) return await res.json()
    return null
  } catch {
    return null
  }
}

export async function fetchEntrypoints(
  signal?: AbortSignal,
): Promise<WireEntryPoints | null> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.ENTRYPOINTS, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface StepsOptions {
  depth?: number
  limit?: number
  through?: boolean
}

export async function fetchSteps(
  anchor: string,
  options?: StepsOptions,
  signal?: AbortSignal,
): Promise<WireStepsPayload | null> {
  try {
    const params = new URLSearchParams()
    params.set("anchor", anchor)
    if (options?.depth) params.set("depth", String(options.depth))
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.through) params.set("through", "1")

    const res = await fetch(`${CODEGRAPH_ROUTES.STEPS}?${params.toString()}`, {
      signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface MapOptions {
  root?: string
  depth?: number
}

export async function fetchMap(
  options?: MapOptions,
  signal?: AbortSignal,
): Promise<WireMapPayload | null> {
  try {
    const params = new URLSearchParams()
    if (options?.root) params.set("root", options.root)
    if (options?.depth) params.set("depth", String(options.depth))

    const res = await fetch(`${CODEGRAPH_ROUTES.MAP}?${params.toString()}`, {
      signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface FlowQueryParam {
  from?: string
  to?: string
  symbols?: string[]
}

export async function fetchFlow(
  query: FlowQueryParam,
  signal?: AbortSignal,
): Promise<WireFlowPayload | null> {
  try {
    const params = new URLSearchParams()
    if (query.from && query.to) {
      params.set("from", query.from)
      params.set("to", query.to)
    } else if (query.symbols && query.symbols.length > 0) {
      params.set("symbols", query.symbols.join(","))
    }

    const res = await fetch(`${CODEGRAPH_ROUTES.FLOW}?${params.toString()}`, {
      signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchScreens(
  signal?: AbortSignal,
): Promise<WireScreensPayload | null> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.SCREENS, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchFileCode(
  filePath: string,
  signal?: AbortSignal,
): Promise<WireFileCodePayload | null> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.FILECODE(filePath), { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchNode(
  id: string,
  signal?: AbortSignal,
): Promise<WireNodeDetail | null> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.NODE(id), { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function searchSymbols(
  q: string,
  signal?: AbortSignal,
): Promise<WireNodeRef[]> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.SEARCH(q), { signal })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data?.results || data?.items || []
  } catch {
    return []
  }
}

export async function triggerInit(): Promise<boolean> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.INIT, { method: "POST" })
    return res.ok
  } catch {
    return false
  }
}

export async function triggerSync(): Promise<boolean> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.SYNC, { method: "POST" })
    return res.ok
  } catch {
    return false
  }
}

export async function triggerReindex(): Promise<boolean> {
  try {
    const res = await fetch(CODEGRAPH_ROUTES.INDEX, { method: "POST" })
    return res.ok
  } catch {
    return false
  }
}
