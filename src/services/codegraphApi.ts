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

function buildEndpointUrl(
  baseUrl: string,
  params?: URLSearchParams,
  workspace?: string,
): string {
  const p = params ? new URLSearchParams(params) : new URLSearchParams()
  if (workspace) {
    p.set("workspace", workspace)
  }
  const qs = p.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
}

async function fetchCodeGraphJson<T>(
  endpoint: string,
  options?: RequestInit,
  endpointLabel = "API",
): Promise<T> {
  let res: Response
  try {
    res = await fetch(endpoint, options)
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw err
    }
    throw new Error(
      `CodeGraph network error: ${err?.message || `Failed to reach CodeGraph ${endpointLabel}`}`,
    )
  }

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText || "Daemon Request Failed"}`
    try {
      const errBody = await res.json()
      if (errBody && typeof errBody.error === "string") {
        errorDetail = errBody.error
      }
    } catch {
      // Body not JSON
    }
    throw new Error(errorDetail)
  }

  return (await res.json()) as T
}

export async function fetchStats(
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireStats> {
  const endpoint = buildEndpointUrl(
    CODEGRAPH_ROUTES.STATS,
    undefined,
    workspace,
  )
  return await fetchCodeGraphJson<WireStats>(endpoint, { signal }, "Stats")
}

/**
 * Normalizes raw payload from @colbymchenry/codegraph entrypoints daemon.
 * Unpacks MCP tool envelopes if present, verifies native keys,
 * and guarantees safe arrays without silent swallowing.
 */
export function normalizeEntrypointsPayload(raw: unknown): WireEntryPoints {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "Invalid CodeGraph entrypoints response: payload must be an object",
    )
  }

  let data = raw as Record<string, any>

  // Unpack MCP CallToolResult envelope if wrapped in { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(data.content) && data.content.length > 0) {
    const textItem = data.content.find(
      (c: any) => c && c.type === "text" && typeof c.text === "string",
    )
    if (textItem) {
      try {
        data = JSON.parse(textItem.text)
      } catch (e) {
        throw new Error(
          `Failed to parse MCP envelope text JSON: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
    }
  }

  // Check if explicit error returned in payload
  if (data.error && typeof data.error === "string") {
    throw new Error(data.error)
  }

  // Native colbymchenry frameworks array
  const frameworks: string[] = Array.isArray(data.frameworks)
    ? data.frameworks
    : []

  // Native colbymchenry routes
  const rawRoutes = data.routes || {}
  const rawRouteItems = rawRoutes.items || {}
  const routeItemList = Array.isArray(rawRouteItems.items)
    ? rawRouteItems.items
    : Array.isArray(rawRouteItems)
      ? rawRouteItems
      : []

  const routes = {
    routed: Boolean(rawRoutes.routed),
    routeCount:
      typeof rawRoutes.routeCount === "number"
        ? rawRoutes.routeCount
        : routeItemList.length,
    items: {
      total:
        typeof rawRouteItems.total === "number"
          ? rawRouteItems.total
          : routeItemList.length,
      shown:
        typeof rawRouteItems.shown === "number"
          ? rawRouteItems.shown
          : routeItemList.length,
      truncated: Boolean(rawRouteItems.truncated),
      items: routeItemList,
    },
  }

  // Native colbymchenry files
  const rawFiles = data.files || {}
  const fileItems = Array.isArray(rawFiles.items)
    ? rawFiles.items
    : Array.isArray(rawFiles)
      ? rawFiles
      : []
  const files = {
    total:
      typeof rawFiles.total === "number" ? rawFiles.total : fileItems.length,
    shown:
      typeof rawFiles.shown === "number" ? rawFiles.shown : fileItems.length,
    truncated: Boolean(rawFiles.truncated),
    items: fileItems,
  }

  // Native colbymchenry tests
  const rawTests = data.tests || {}
  const testItems = Array.isArray(rawTests.items)
    ? rawTests.items
    : Array.isArray(rawTests)
      ? rawTests
      : []
  const tests = {
    total:
      typeof rawTests.total === "number" ? rawTests.total : testItems.length,
    shown:
      typeof rawTests.shown === "number" ? rawTests.shown : testItems.length,
    truncated: Boolean(rawTests.truncated),
    items: testItems,
  }

  // Native colbymchenry hubs
  const rawHubs = data.hubs || {}
  const hubItems = Array.isArray(rawHubs.items)
    ? rawHubs.items
    : Array.isArray(rawHubs)
      ? rawHubs
      : []
  const hubs = {
    total: typeof rawHubs.total === "number" ? rawHubs.total : hubItems.length,
    shown: typeof rawHubs.shown === "number" ? rawHubs.shown : hubItems.length,
    truncated: Boolean(rawHubs.truncated),
    items: hubItems,
  }

  // Native colbymchenry index & timing
  const rawIndex = data.index || {}
  const index = {
    lastIndexedAt:
      typeof rawIndex.lastIndexedAt === "number"
        ? rawIndex.lastIndexedAt
        : null,
    files: typeof rawIndex.files === "number" ? rawIndex.files : files.total,
  }

  const rawTiming = data.timing || {}
  const timing = {
    elapsedMs:
      typeof rawTiming.elapsedMs === "number" ? rawTiming.elapsedMs : 0,
    cached: Boolean(rawTiming.cached),
  }

  return {
    frameworks,
    routes,
    files,
    tests,
    hubs,
    index,
    timing,
  }
}

export async function fetchEntrypoints(
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireEntryPoints> {
  const endpoint = buildEndpointUrl(
    CODEGRAPH_ROUTES.ENTRYPOINTS,
    undefined,
    workspace,
  )
  const raw = await fetchCodeGraphJson<unknown>(
    endpoint,
    { signal },
    "Entrypoints",
  )
  return normalizeEntrypointsPayload(raw)
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
  workspace?: string,
): Promise<WireStepsPayload> {
  const params = new URLSearchParams()
  params.set("anchor", anchor)
  if (options?.depth) params.set("depth", String(options.depth))
  if (options?.limit) params.set("limit", String(options.limit))
  if (options?.through) params.set("through", "1")

  const endpoint = buildEndpointUrl(CODEGRAPH_ROUTES.STEPS, params, workspace)
  return await fetchCodeGraphJson<WireStepsPayload>(
    endpoint,
    { signal },
    "Steps",
  )
}

export interface MapOptions {
  root?: string
  depth?: number
}

export async function fetchMap(
  options?: MapOptions,
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireMapPayload> {
  const params = new URLSearchParams()
  if (options?.root) params.set("root", options.root)
  if (options?.depth) params.set("depth", String(options.depth))

  const endpoint = buildEndpointUrl(CODEGRAPH_ROUTES.MAP, params, workspace)
  return await fetchCodeGraphJson<WireMapPayload>(
    endpoint,
    { signal },
    "Architecture Map",
  )
}

export interface FlowQueryParam {
  from?: string
  to?: string
  symbols?: string[]
}

export async function fetchFlow(
  query: FlowQueryParam,
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireFlowPayload> {
  const params = new URLSearchParams()
  if (query.from && query.to) {
    params.set("from", query.from)
    params.set("to", query.to)
  } else if (query.symbols && query.symbols.length > 0) {
    params.set("symbols", query.symbols.join(","))
  }

  const endpoint = buildEndpointUrl(CODEGRAPH_ROUTES.FLOW, params, workspace)
  return await fetchCodeGraphJson<WireFlowPayload>(endpoint, { signal }, "Flow")
}

export async function fetchScreens(
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireScreensPayload> {
  const endpoint = buildEndpointUrl(
    CODEGRAPH_ROUTES.SCREENS,
    undefined,
    workspace,
  )
  return await fetchCodeGraphJson<WireScreensPayload>(
    endpoint,
    { signal },
    "Screens",
  )
}

export async function fetchFileCode(
  filePath: string,
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireFileCodePayload> {
  const baseUrl = CODEGRAPH_ROUTES.FILECODE(filePath)
  const endpoint = buildEndpointUrl(baseUrl, undefined, workspace)
  return await fetchCodeGraphJson<WireFileCodePayload>(
    endpoint,
    { signal },
    "FileCode",
  )
}

export async function fetchNode(
  id: string,
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireNodeDetail> {
  const baseUrl = CODEGRAPH_ROUTES.NODE(id)
  const endpoint = buildEndpointUrl(baseUrl, undefined, workspace)
  return await fetchCodeGraphJson<WireNodeDetail>(endpoint, { signal }, "Node")
}

export async function searchSymbols(
  q: string,
  signal?: AbortSignal,
  workspace?: string,
): Promise<WireNodeRef[]> {
  const params = new URLSearchParams()
  params.set("q", q)
  const endpoint = buildEndpointUrl(
    `${CODEGRAPH_ROUTES.BASE}/search`,
    params,
    workspace,
  )
  const data = await fetchCodeGraphJson<any>(endpoint, { signal }, "Search")
  return Array.isArray(data) ? data : data?.results || data?.items || []
}

export async function triggerInit(workspace?: string): Promise<boolean> {
  const endpoint = buildEndpointUrl(CODEGRAPH_ROUTES.INIT, undefined, workspace)
  const res = await fetch(endpoint, { method: "POST" })
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText || "Init Failed"}`
    try {
      const b = await res.json()
      if (b?.error) errorDetail = b.error
    } catch {}
    throw new Error(errorDetail)
  }
  return true
}

export async function triggerSync(workspace?: string): Promise<boolean> {
  const endpoint = buildEndpointUrl(CODEGRAPH_ROUTES.SYNC, undefined, workspace)
  const res = await fetch(endpoint, { method: "POST" })
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText || "Sync Failed"}`
    try {
      const b = await res.json()
      if (b?.error) errorDetail = b.error
    } catch {}
    throw new Error(errorDetail)
  }
  return true
}

export async function triggerReindex(workspace?: string): Promise<boolean> {
  const endpoint = buildEndpointUrl(
    CODEGRAPH_ROUTES.INDEX,
    undefined,
    workspace,
  )
  const res = await fetch(endpoint, { method: "POST" })
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}: ${res.statusText || "Reindex Failed"}`
    try {
      const b = await res.json()
      if (b?.error) errorDetail = b.error
    } catch {}
    throw new Error(errorDetail)
  }
  return true
}
