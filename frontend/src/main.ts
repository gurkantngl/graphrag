import ForceGraph from 'force-graph'

import './style.css'

type QueryResponse = {
  answer: string
  rationale: {
    policies: string[]
    exceptions: string[]
    roles: string[]
    tags: string[]
  }
  rationale_text: string
  summary: string
  summary_source: 'llm' | 'extractive'
  alerts: string[]
  conflicts: string[]
  sources: Array<{ id: string; title: string; source: string; score: number | null }>
  graph: {
    nodes: Array<{ id: string; label: string; type: string }>
    edges: Array<{ from: string; to: string; type: string }>
  }
}

type GraphNode = { id: string; label: string; type: string }
type GraphLink = { source: string; target: string; type: string }

const NODE_COLORS: Record<string, string> = {
  Document: '#2563eb',
  Policy: '#7c3aed',
  Role: '#16a34a',
  Exception: '#dc2626',
  Tag: '#f59e0b',
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App container not found')
}

app.innerHTML = `
  <div class="app">
    <header class="app-header">
      <div>
        <h1>GraphRAG Policy Copilot</h1>
        <p>Seed yukle, soru sor, kaynak ve graph ciktisini gor.</p>
      </div>
      <button id="themeToggle" class="ghost">Dark Mode</button>
    </header>

    <div class="layout">
      <section class="column">
        <div class="panel panel--accent">
          <div class="panel-header">
            <h2>Kontrol Paneli</h2>
            <p>Backend baglantisi ve seed islemleri.</p>
          </div>
          <label>
            Backend URL
            <input id="apiBase" type="text" value="http://localhost:8000" />
          </label>
          <div class="actions">
            <button id="seedLoad">Seed Yukle</button>
            <button id="seedReset">Reset + Seed</button>
          </div>
          <p id="seedStatus" class="status"></p>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Sorgu</h2>
            <p>Filtreleri doldur, sorguyu calistir.</p>
          </div>
          <label>
            Soru
            <input id="queryText" type="text" placeholder="ornek: emergency access ne zaman kullanilir?" />
          </label>
          <div class="history">
            <h3>Son sorgular</h3>
            <ul id="queryHistory"></ul>
          </div>
          <div class="filters">
            <label>
              Role
              <input id="queryRole" type="text" placeholder="ornek: IT Admin" list="rolesList" />
              <datalist id="rolesList"></datalist>
            </label>
            <label>
              Policy
              <input
                id="queryPolicy"
                type="text"
                placeholder="ornek: Incident Response"
                list="policiesList"
              />
              <datalist id="policiesList"></datalist>
            </label>
            <label>
              Tag
              <input id="queryTag" type="text" placeholder="ornek: security" list="tagsList" />
              <datalist id="tagsList"></datalist>
            </label>
          </div>
          <label>
            Limit
            <input id="queryLimit" type="number" min="1" max="10" value="5" />
          </label>
          <label class="toggle">
            <input id="useLlm" type="checkbox" />
            LLM ile ozetle
          </label>
          <div class="query-actions">
            <button id="queryRun">Sorgula</button>
            <span id="querySpinner" class="spinner hidden" aria-hidden="true"></span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Export</h2>
            <p>Son sorgu sonucunu disari aktar.</p>
          </div>
          <div class="export-actions">
            <button id="exportJson">Export JSON</button>
            <button id="exportPng">Export Graph PNG</button>
          </div>
        </div>
      </section>

      <section class="column">
        <div class="panel">
          <div class="panel-header">
            <h2>Cevap</h2>
            <p>RAG sonucu ve kaynak odakli yanit.</p>
          </div>
          <p id="answer" class="answer">Henüz sorgu yok.</p>
        </div>

        <div class="panel panel--summary">
          <div class="panel-header">
            <h2>Ozet</h2>
            <p id="summarySource" class="summary-source"></p>
          </div>
          <p id="summary" class="summary">Henüz ozet yok.</p>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Gerekce</h2>
            <p id="rationaleText" class="rationale-text"></p>
          </div>
          <div class="rationale">
            <div>
              <h3>Policies</h3>
              <ul id="rationalePolicies"></ul>
            </div>
            <div>
              <h3>Exceptions</h3>
              <ul id="rationaleExceptions"></ul>
            </div>
            <div>
              <h3>Roles</h3>
              <ul id="rationaleRoles"></ul>
            </div>
            <div>
              <h3>Tags</h3>
              <ul id="rationaleTags"></ul>
            </div>
          </div>
        </div>

        <div class="panel panel--alert">
          <div class="panel-header">
            <h2>Uyarilar</h2>
            <p>Riskli istisna veya policy uyarilari.</p>
          </div>
          <ul id="alerts" class="status-list"></ul>
        </div>

        <div class="panel panel--warning">
          <div class="panel-header">
            <h2>Celiski Tespiti</h2>
            <p>Policy sure ve kural tutarsizliklari.</p>
          </div>
          <ul id="conflicts" class="status-list"></ul>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h2>Kaynaklar</h2>
            <p>Skor bazli kaynak listesi.</p>
          </div>
          <ul id="sources"></ul>
        </div>

        <div class="panel panel--graph">
          <div class="panel-header">
            <h2>Graph</h2>
            <p>Iliski haritasi ve detaylar.</p>
          </div>
          <div class="legend">
            <div><span class="dot" style="background:#2563eb"></span>Document</div>
            <div><span class="dot" style="background:#7c3aed"></span>Policy</div>
            <div><span class="dot" style="background:#16a34a"></span>Role</div>
            <div><span class="dot" style="background:#dc2626"></span>Exception</div>
            <div><span class="dot" style="background:#f59e0b"></span>Tag</div>
          </div>
          <div id="graphCanvas" class="graph-canvas"></div>
          <div class="node-detail">
            <h3>Node Detay</h3>
            <p id="nodeDetail">Herhangi bir node sec.</p>
            <p id="nodeSummary" class="node-summary"></p>
            <p id="nodeTypeSummary" class="node-summary"></p>
            <p id="nodeTopNeighbors" class="node-summary"></p>
            <ul id="nodeConnections"></ul>
          </div>
          <div class="edge-detail">
            <h3>Edge Detay</h3>
            <p id="edgeDetail">Herhangi bir edge uzerine gel.</p>
          </div>
          <div class="graph">
            <div>
              <h3>Nodes</h3>
              <ul id="nodes"></ul>
            </div>
            <div>
              <h3>Edges</h3>
              <ul id="edges"></ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
`

const apiBaseInput = document.querySelector<HTMLInputElement>('#apiBase')
const seedStatus = document.querySelector<HTMLParagraphElement>('#seedStatus')
const queryInput = document.querySelector<HTMLInputElement>('#queryText')
const queryRole = document.querySelector<HTMLInputElement>('#queryRole')
const queryPolicy = document.querySelector<HTMLInputElement>('#queryPolicy')
const queryTag = document.querySelector<HTMLInputElement>('#queryTag')
const limitInput = document.querySelector<HTMLInputElement>('#queryLimit')
const useLlmInput = document.querySelector<HTMLInputElement>('#useLlm')
const answerEl = document.querySelector<HTMLParagraphElement>('#answer')
const summaryEl = document.querySelector<HTMLParagraphElement>('#summary')
const summarySourceEl = document.querySelector<HTMLParagraphElement>('#summarySource')
const rationaleText = document.querySelector<HTMLParagraphElement>('#rationaleText')
const rationalePolicies = document.querySelector<HTMLUListElement>('#rationalePolicies')
const rationaleExceptions = document.querySelector<HTMLUListElement>('#rationaleExceptions')
const rationaleRoles = document.querySelector<HTMLUListElement>('#rationaleRoles')
const rationaleTags = document.querySelector<HTMLUListElement>('#rationaleTags')
const alertsEl = document.querySelector<HTMLUListElement>('#alerts')
const conflictsEl = document.querySelector<HTMLUListElement>('#conflicts')
const sourcesEl = document.querySelector<HTMLUListElement>('#sources')
const nodesEl = document.querySelector<HTMLUListElement>('#nodes')
const edgesEl = document.querySelector<HTMLUListElement>('#edges')
const graphCanvas = document.querySelector<HTMLDivElement>('#graphCanvas')
const nodeDetail = document.querySelector<HTMLParagraphElement>('#nodeDetail')
const nodeSummary = document.querySelector<HTMLParagraphElement>('#nodeSummary')
const nodeTypeSummary = document.querySelector<HTMLParagraphElement>('#nodeTypeSummary')
const nodeTopNeighbors = document.querySelector<HTMLParagraphElement>('#nodeTopNeighbors')
const nodeConnections = document.querySelector<HTMLUListElement>('#nodeConnections')
const edgeDetail = document.querySelector<HTMLParagraphElement>('#edgeDetail')
const exportJsonBtn = document.querySelector<HTMLButtonElement>('#exportJson')
const exportPngBtn = document.querySelector<HTMLButtonElement>('#exportPng')

const seedLoadBtn = document.querySelector<HTMLButtonElement>('#seedLoad')
const seedResetBtn = document.querySelector<HTMLButtonElement>('#seedReset')
const queryRunBtn = document.querySelector<HTMLButtonElement>('#queryRun')
const querySpinner = document.querySelector<HTMLSpanElement>('#querySpinner')
const rolesList = document.querySelector<HTMLDataListElement>('#rolesList')
const policiesList = document.querySelector<HTMLDataListElement>('#policiesList')
const tagsList = document.querySelector<HTMLDataListElement>('#tagsList')
const queryHistory = document.querySelector<HTMLUListElement>('#queryHistory')
const themeToggle = document.querySelector<HTMLButtonElement>('#themeToggle')

const setStatus = (text: string) => {
  if (seedStatus) {
    seedStatus.textContent = text
  }
}

const getApiBase = () => apiBaseInput?.value.trim() || 'http://localhost:8000'

const postJson = async <T>(
  url: string,
  body?: unknown,
  timeoutMs: number = 60000,
): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || 'Request failed')
    }
    return response.json() as Promise<T>
  } finally {
    window.clearTimeout(timeout)
  }
}

const loadFilters = async () => {
  try {
    const response = await fetch(`${getApiBase()}/meta/filters`)
    if (!response.ok) return
    const data = (await response.json()) as {
      roles: string[]
      policies: string[]
      tags: string[]
    }

    const fillList = (el: HTMLDataListElement | null, items: string[]) => {
      if (!el) return
      el.innerHTML = ''
      items.forEach((item) => {
        const option = document.createElement('option')
        option.value = item
        el.appendChild(option)
      })
    }

    fillList(rolesList, data.roles)
    fillList(policiesList, data.policies)
    fillList(tagsList, data.tags)
  } catch {
    // ignore filter load errors
  }
}

let currentGraph: { nodes: GraphNode[]; links: GraphLink[] } | null = null
let selectedNodeId: string | null = null
let hoveredLink: GraphLink | null = null
let lastQueryResult: QueryResponse | null = null
let graphInstanceRef: ReturnType<typeof ForceGraph> | null = null

const renderNodeConnections = (nodeId: string) => {
  if (!nodeConnections || !currentGraph) return
  nodeConnections.innerHTML = ''
  const related = currentGraph.links.filter(
    (link) => link.source === nodeId || link.target === nodeId,
  )
  if (nodeSummary) {
    const typeCounts = related.reduce<Record<string, number>>((acc, link) => {
      acc[link.type] = (acc[link.type] || 0) + 1
      return acc
    }, {})
    const total = related.length
    const typesText = Object.entries(typeCounts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ')
    nodeSummary.textContent =
      total === 0 ? 'Bagli iliski yok.' : `Toplam ${total} iliski. ${typesText}`
  }
  if (nodeTypeSummary && currentGraph) {
    const neighborCounts = related.reduce<Record<string, number>>((acc, link) => {
      const otherId = link.source === nodeId ? link.target : link.source
      const otherNode = currentGraph.nodes.find((node) => node.id === otherId)
      if (!otherNode) return acc
      acc[otherNode.type] = (acc[otherNode.type] || 0) + 1
      return acc
    }, {})
    const neighborText = Object.entries(neighborCounts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ')
    nodeTypeSummary.textContent =
      neighborText ? `Komşu tipleri: ${neighborText}` : ''
  }
  if (nodeTopNeighbors && currentGraph) {
    const neighborMap = related.reduce<Record<string, { label: string; type: string; count: number }>>(
      (acc, link) => {
        const otherId = link.source === nodeId ? link.target : link.source
        const otherNode = currentGraph.nodes.find((node) => node.id === otherId)
        if (!otherNode) return acc
        if (!acc[otherId]) {
          acc[otherId] = { label: otherNode.label, type: otherNode.type, count: 0 }
        }
        acc[otherId].count += 1
        return acc
      },
      {},
    )
    const topNeighbors = Object.values(neighborMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    nodeTopNeighbors.textContent = topNeighbors.length
      ? `En cok bagli komsular: ${topNeighbors
          .map((item) => `${item.label} [${item.type}] (${item.count})`)
          .join(' | ')}`
      : ''
  }
  if (!related.length) {
    const item = document.createElement('li')
    item.textContent = 'Iliski bulunamadi.'
    nodeConnections.appendChild(item)
    return
  }
  related.forEach((link) => {
    const item = document.createElement('li')
    const otherId = link.source === nodeId ? link.target : link.source
    const otherNode = currentGraph.nodes.find((node) => node.id === otherId)
    const otherLabel = otherNode ? `${otherNode.label} [${otherNode.type}]` : otherId
    item.textContent = `${link.type} -> ${otherLabel}`
    nodeConnections.appendChild(item)
  })
}

const initGraph = () => {
  if (!graphCanvas) return null
  const graph = ForceGraph()(graphCanvas)
    .nodeId('id')
    .nodeLabel('label')
    .nodeColor((node) => {
      const typed = node as GraphNode
      return NODE_COLORS[typed.type] ?? '#6b7280'
    })
    .nodePointerAreaPaint((node, color, ctx) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc((node as any).x, (node as any).y, 6, 0, 2 * Math.PI)
      ctx.fill()
    })
    .linkLabel('type')
    .linkColor(() => '#94a3b8')
    .linkDirectionalArrowLength(6)
    .linkDirectionalArrowRelPos(1)
    .linkDirectionalParticles(2)
    .enableNodeDrag(true)
    .enableZoomPanInteraction(true)
    .cooldownTicks(0)
    .d3VelocityDecay(0.3)

  graph.onNodeClick((node) => {
    const typed = node as GraphNode
    if (!nodeDetail) return
    nodeDetail.textContent = `${typed.label} [${typed.type}]`
    selectedNodeId = typed.id
    renderNodeConnections(typed.id)
    highlightGraph(graph)
  })

  graph.onNodeDrag(() => {
    graph.d3ReheatSimulation()
  })

  graph.onNodeDragEnd(() => {
    graph.d3ReheatSimulation()
  })

  graph.onLinkHover((link) => {
    if (!edgeDetail) return
    if (!link) {
      edgeDetail.textContent = 'Herhangi bir edge uzerine gel.'
      hoveredLink = null
      highlightGraph(graph)
      return
    }
    const typed = link as GraphLink
    hoveredLink = typed
    const sourceId = typeof typed.source === 'string' ? typed.source : typed.source.id
    const targetId = typeof typed.target === 'string' ? typed.target : typed.target.id
    const sourceNode = currentGraph?.nodes.find((node) => node.id === sourceId)
    const targetNode = currentGraph?.nodes.find((node) => node.id === targetId)
    const sourceLabel = sourceNode ? `${sourceNode.label} [${sourceNode.type}]` : sourceId
    const targetLabel = targetNode ? `${targetNode.label} [${targetNode.type}]` : targetId
    edgeDetail.textContent = `${sourceLabel} -(${typed.type})-> ${targetLabel}`
    highlightGraph(graph)
  })
    .linkDirectionalParticleWidth(2)

  const resize = () => {
    graph.width(graphCanvas.clientWidth)
    graph.height(Math.max(260, graphCanvas.clientHeight))
  }
  resize()
  window.addEventListener('resize', resize)

  return graph
}

const graphInstance = initGraph()
graphInstanceRef = graphInstance

const resizeGraph = () => {
  if (!graphInstanceRef || !graphCanvas) return
  graphInstanceRef.width(graphCanvas.clientWidth)
  graphInstanceRef.height(Math.max(320, graphCanvas.clientHeight))
}

const renderQueryResult = (data: QueryResponse) => {
  lastQueryResult = data
  if (answerEl) answerEl.textContent = data.answer
  if (summaryEl) summaryEl.textContent = data.summary
  if (summarySourceEl) {
    summarySourceEl.textContent =
      data.summary_source === 'llm' ? 'Ozet kaynagi: LLM' : 'Ozet kaynagi: extractive'
  }

  const renderList = (el: HTMLUListElement | null, items: string[]) => {
    if (!el) return
    el.innerHTML = ''
    items.forEach((itemText) => {
      const item = document.createElement('li')
      item.textContent = itemText
      el.appendChild(item)
    })
  }

  if (rationaleText) {
    rationaleText.textContent = data.rationale_text
  }
  renderList(rationalePolicies, data.rationale.policies)
  renderList(rationaleExceptions, data.rationale.exceptions)
  renderList(rationaleRoles, data.rationale.roles)
  renderList(rationaleTags, data.rationale.tags)

  if (alertsEl) {
    alertsEl.innerHTML = ''
    if (!data.alerts.length) {
      const item = document.createElement('li')
      item.textContent = 'Uyari bulunamadi.'
      alertsEl.appendChild(item)
    } else {
      data.alerts.forEach((alert) => {
        const item = document.createElement('li')
        item.textContent = alert
        alertsEl.appendChild(item)
      })
    }
  }

  if (conflictsEl) {
    conflictsEl.innerHTML = ''
    if (!data.conflicts.length) {
      const item = document.createElement('li')
      item.textContent = 'Cakisli kural bulunamadi.'
      conflictsEl.appendChild(item)
    } else {
      data.conflicts.forEach((conflict) => {
        const item = document.createElement('li')
        item.textContent = conflict
        conflictsEl.appendChild(item)
      })
    }
  }

  if (sourcesEl) {
    sourcesEl.innerHTML = ''
    data.sources.forEach((source) => {
      const item = document.createElement('li')
      const scoreText =
        source.score === null ? '' : ` | skor: ${source.score.toFixed(4)}`
      item.textContent = `${source.title} (${source.source})${scoreText}`
      sourcesEl.appendChild(item)
    })
  }

  if (nodesEl) {
    nodesEl.innerHTML = ''
    data.graph.nodes.forEach((node) => {
      const item = document.createElement('li')
      item.textContent = `${node.label} [${node.type}]`
      nodesEl.appendChild(item)
    })
  }

  if (edgesEl) {
    edgesEl.innerHTML = ''
    data.graph.edges.forEach((edge) => {
      const item = document.createElement('li')
      item.textContent = `${edge.from} -(${edge.type})-> ${edge.to}`
      edgesEl.appendChild(item)
    })
  }

  if (graphInstance) {
    const nodes: GraphNode[] = data.graph.nodes
    const links: GraphLink[] = data.graph.edges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      type: edge.type,
    }))
    currentGraph = { nodes, links }
    graphInstance.graphData({ nodes, links })
    graphInstance.d3ReheatSimulation()
    resizeGraph()
    window.requestAnimationFrame(() => {
      graphInstance.zoomToFit(400)
    })
    highlightGraph(graphInstance)
  }

  if (nodeDetail) {
    nodeDetail.textContent = 'Herhangi bir node sec.'
  }
  if (nodeSummary) {
    nodeSummary.textContent = ''
  }
  if (nodeTypeSummary) {
    nodeTypeSummary.textContent = ''
  }
  if (nodeTopNeighbors) {
    nodeTopNeighbors.textContent = ''
  }
  if (nodeConnections) {
    nodeConnections.innerHTML = ''
  }
  selectedNodeId = null
  hoveredLink = null
  if (alertsEl) {
    alertsEl.innerHTML = ''
  }
  if (conflictsEl) {
    conflictsEl.innerHTML = ''
  }
}

const setQueryLoading = (isLoading: boolean) => {
  if (querySpinner) {
    querySpinner.classList.toggle('hidden', !isLoading)
  }
  if (queryRunBtn) {
    queryRunBtn.disabled = isLoading
  }
}

const HISTORY_KEY = 'graphrag.query.history'

const readHistory = (): string[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

const writeHistory = (items: string[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
}

const addToHistory = (query: string) => {
  if (!queryHistory) return
  const items = readHistory()
  const nextItems = [query, ...items.filter((item) => item !== query)].slice(0, 5)
  writeHistory(nextItems)
  queryHistory.innerHTML = ''
  nextItems.forEach((itemText) => {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = itemText
    button.className = 'ghost'
    button.addEventListener('click', () => {
      if (queryInput) queryInput.value = itemText
    })
    item.appendChild(button)
    queryHistory.appendChild(item)
  })
}

const renderHistory = () => {
  if (!queryHistory) return
  const items = readHistory()
  if (!items.length) {
    queryHistory.innerHTML = ''
    return
  }
  queryHistory.innerHTML = ''
  items.forEach((itemText) => {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = itemText
    button.className = 'ghost'
    button.addEventListener('click', () => {
      if (queryInput) queryInput.value = itemText
    })
    item.appendChild(button)
    queryHistory.appendChild(item)
  })
}

const THEME_KEY = 'graphrag.theme'

const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.setAttribute('data-theme', theme)
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode'
  }
  localStorage.setItem(THEME_KEY, theme)
}

const initTheme = () => {
  const stored = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null
  if (stored) {
    applyTheme(stored)
    return
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

const highlightGraph = (graph: ReturnType<typeof ForceGraph>) => {
  if (!currentGraph) return
  const neighbors = new Set<string>()
  const edges = currentGraph.links
  if (selectedNodeId) {
    edges.forEach((link) => {
      if (link.source === selectedNodeId) neighbors.add(link.target)
      if (link.target === selectedNodeId) neighbors.add(link.source)
    })
  }

  const labelColor =
    document.documentElement.getAttribute('data-theme') === 'dark' ? '#e5e7eb' : '#111827'

  graph.nodeCanvasObject((node, ctx, globalScale) => {
    const typed = node as GraphNode
    const label = typed.label
    const fontSize = 12 / globalScale
    const isSelected = selectedNodeId === typed.id
    const isNeighbor = neighbors.has(typed.id)
    const alpha = selectedNodeId && !isSelected && !isNeighbor ? 0.2 : 1
    const color = NODE_COLORS[typed.type] ?? '#6b7280'

    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc((node as any).x, (node as any).y, isSelected ? 6 : 4, 0, 2 * Math.PI)
    ctx.fill()

    ctx.globalAlpha = alpha
    ctx.font = `${fontSize}px Sans-Serif`
    ctx.fillStyle = labelColor
    ctx.fillText(label, (node as any).x + 8, (node as any).y + 4)
    ctx.globalAlpha = 1
  })

  graph.linkWidth((link) => {
    const typed = link as GraphLink
    const sourceId = typeof typed.source === 'string' ? typed.source : typed.source.id
    const targetId = typeof typed.target === 'string' ? typed.target : typed.target.id
    if (hoveredLink) {
      const hoverSource =
        typeof hoveredLink.source === 'string' ? hoveredLink.source : hoveredLink.source.id
      const hoverTarget =
        typeof hoveredLink.target === 'string' ? hoveredLink.target : hoveredLink.target.id
      const isHovered =
        (sourceId === hoverSource && targetId === hoverTarget) ||
        (sourceId === hoverTarget && targetId === hoverSource)
      return isHovered ? 3 : 0.5
    }
    if (!selectedNodeId) return 1
    return sourceId === selectedNodeId || targetId === selectedNodeId ? 2.5 : 0.5
  })

  graph.linkColor((link) => {
    const typed = link as GraphLink
    const sourceId = typeof typed.source === 'string' ? typed.source : typed.source.id
    const targetId = typeof typed.target === 'string' ? typed.target : typed.target.id
    if (hoveredLink) {
      const hoverSource =
        typeof hoveredLink.source === 'string' ? hoveredLink.source : hoveredLink.source.id
      const hoverTarget =
        typeof hoveredLink.target === 'string' ? hoveredLink.target : hoveredLink.target.id
      const isHovered =
        (sourceId === hoverSource && targetId === hoverTarget) ||
        (sourceId === hoverTarget && targetId === hoverSource)
      return isHovered ? '#0f172a' : '#cbd5f5'
    }
    return '#94a3b8'
  })
}

seedLoadBtn?.addEventListener('click', async () => {
  try {
    setStatus('Seed yukleniyor...')
    const data = await postJson<{ created: number; skipped: number }>(
      `${getApiBase()}/seed/load`,
    )
    setStatus(`Seed tamamlandi. Created: ${data.created}, Skipped: ${data.skipped}`)
    await loadFilters()
  } catch (error) {
    setStatus(`Hata: ${(error as Error).message}`)
  }
})

seedResetBtn?.addEventListener('click', async () => {
  try {
    setStatus('Reset + seed yukleniyor...')
    const data = await postJson<{ created: number; skipped: number }>(
      `${getApiBase()}/seed/load?reset=true`,
    )
    setStatus(`Reset tamamlandi. Created: ${data.created}, Skipped: ${data.skipped}`)
    await loadFilters()
  } catch (error) {
    setStatus(`Hata: ${(error as Error).message}`)
  }
})

queryRunBtn?.addEventListener('click', async () => {
  try {
    if (!queryInput?.value.trim()) {
      if (answerEl) answerEl.textContent = 'Lutfen bir soru gir.'
      return
    }
    setQueryLoading(true)
    if (answerEl) answerEl.textContent = 'Sorgu calisiyor...'
    const data = await postJson<QueryResponse>(
      `${getApiBase()}/query`,
      {
        query: queryInput.value.trim(),
        limit: Number(limitInput?.value || 5),
        role: queryRole?.value.trim() || null,
        policy: queryPolicy?.value.trim() || null,
        tag: queryTag?.value.trim() || null,
        use_llm: useLlmInput?.checked ?? false,
      },
      60000,
    )
    addToHistory(queryInput.value.trim())
    renderQueryResult(data)
  } catch (error) {
    const message =
      (error as Error).name === 'AbortError'
        ? 'Hata: sorgu zaman asimina ugradi.'
        : `Hata: ${(error as Error).message}`
    if (answerEl) answerEl.textContent = message
  } finally {
    setQueryLoading(false)
  }
})

exportJsonBtn?.addEventListener('click', () => {
  if (!lastQueryResult) {
    alert('Once bir sorgu calistir.')
    return
  }
  const blob = new Blob([JSON.stringify(lastQueryResult, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'graphrag-query-result.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
})

exportPngBtn?.addEventListener('click', () => {
  if (!graphCanvas) return
  const canvas = graphCanvas.querySelector('canvas') as HTMLCanvasElement | null
  if (!canvas) {
    alert('Graph canvas bulunamadi.')
    return
  }
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = 'graphrag-graph.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
})

loadFilters()
renderHistory()
initTheme()

themeToggle?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  applyTheme(current === 'dark' ? 'light' : 'dark')
})
