import "./style.css"

const HALF_W = 32
const HALF_H = 16
const TILE_W = 64
const TILE_H = 32
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.6
const RENDER_MARGIN = 4
const SAVE_KEY = "isocity:city:v2"
const LEGACY_KEY = "isocity:city:v1"
const INITIAL_CENTER = { x: 0, y: 176 }

type Structure = "road" | "house" | "tower" | "tree"
type Tool = Structure | "water" | "erase"
type Point = [number, number]

interface Vec {
  x: number
  y: number
}

interface Tile {
  gx: number
  gy: number
}

const POPULATION: Record<Structure, number> = {
  road: 0,
  house: 4,
  tower: 30,
  tree: 0,
}

const LAND = "#e6e5e1"
const WATER = "#78a3b5"
const ROAD = "#b4b2ad"
const BRIDGE = "#c0bdb6"
const DETAIL = "#3f3e3e"
const ACCENT = "#f5c518"
const ACCENT_DARK = "#d6a900"

/* ---------- helpers ---------- */

function element<T extends Element>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing #${id}`)
  return found as unknown as T
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const isoX = (gx: number, gy: number): number => (gx - gy) * HALF_W
const isoY = (gx: number, gy: number): number => (gx + gy) * HALF_H

const tileKey = (gx: number, gy: number): string => `${gx},${gy}`
const KEY_RE = /^-?\d+,-?\d+$/

const isStructure = (value: unknown): value is Structure =>
  value === "road" || value === "house" || value === "tower" || value === "tree"

function hashCell(gx: number, gy: number): number {
  return (Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663)) >>> 0
}

const round = (value: number): number => Math.round(value * 100) / 100

const points = (list: Point[]): string =>
  list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")

const polygon = (list: Point[], fill: string): string =>
  `<polygon points="${points(list)}" fill="${fill}"/>`

const lineMarkup = (from: Point, to: Point, className: string): string =>
  `<line class="${className}" x1="${round(from[0])}" y1="${round(from[1])}" x2="${round(to[0])}" y2="${round(to[1])}"/>`

/* ---------- meshes ---------- */

interface BoxOptions {
  rx: number
  ry: number
  h: number
  y?: number
  top: string
  left: string
  right: string
}

function box({ rx, ry, h, y = 0, top, left, right }: BoxOptions): string {
  const backTop: Point = [0, y - ry - h]
  const rightTop: Point = [rx, y - h]
  const frontTop: Point = [0, y + ry - h]
  const leftTop: Point = [-rx, y - h]
  const rightBase: Point = [rx, y]
  const frontBase: Point = [0, y + ry]
  const leftBase: Point = [-rx, y]

  return [
    polygon([leftTop, frontTop, frontBase, leftBase], left),
    polygon([frontTop, rightTop, rightBase, frontBase], right),
    polygon([backTop, rightTop, frontTop, leftTop], top),
  ].join("")
}

function faceQuad(
  origin: Point,
  u: Point,
  v: Point,
  u1: number,
  u2: number,
  v1: number,
  v2: number,
  fill: string,
): string {
  const at = (uu: number, vv: number): Point => [
    origin[0] + u[0] * uu + v[0] * vv,
    origin[1] + u[1] * uu + v[1] * vv,
  ]

  return polygon([at(u1, v1), at(u2, v1), at(u2, v2), at(u1, v2)], fill)
}

/* ---------- buildings ---------- */

function houseMarkup(seed: number): string {
  const rx = 21
  const ry = 10.5
  const wallHeight = 15 + (seed % 3)
  const roofHeight = 12 + (seed % 2)
  const wallTop = -wallHeight
  const frontTop: Point = [0, wallTop + ry]
  const apex: Point = [0, wallTop - roofHeight]

  const walls = box({
    rx,
    ry,
    h: wallHeight,
    top: "#f7f6f2",
    left: "#f3f2ee",
    right: "#deddd9",
  })

  const roofLeft = polygon([[-rx, wallTop], frontTop, apex], ACCENT)
  const roofRight = polygon([frontTop, [rx, wallTop], apex], ACCENT_DARK)

  const rightU: Point = [rx, -ry]
  const rightV: Point = [0, wallHeight]
  const door = faceQuad(frontTop, rightU, rightV, 0.55, 0.78, 0.3, 1, DETAIL)

  const leftU: Point = [-rx, -ry]
  const window = faceQuad(frontTop, leftU, rightV, 0.34, 0.52, 0.26, 0.5, DETAIL)

  return `<g class="building">${walls}${roofLeft}${roofRight}${door}${window}</g>`
}

function towerMarkup(seed: number): string {
  const rx = 19
  const ry = 10
  const baseHeight = 42 + (seed % 3) * 5
  const capHeight = 11 + (seed % 2) * 3
  const topY = -baseHeight

  const body = box({
    rx,
    ry,
    h: baseHeight,
    top: "#eceae6",
    left: "#f4f3ef",
    right: "#deddd9",
  })

  const cap = box({
    rx: 13,
    ry: 7,
    h: capHeight,
    y: topY,
    top: ACCENT,
    left: "#e8b400",
    right: ACCENT_DARK,
  })

  const frontTop: Point = [0, topY + ry]
  const rightU: Point = [rx, -ry]
  const leftU: Point = [-rx, -ry]
  const down: Point = [0, baseHeight]

  const columns: Array<[number, number]> = [
    [0.2, 0.36],
    [0.52, 0.68],
  ]
  const rows: Array<[number, number]> = [
    [0.16, 0.28],
    [0.4, 0.52],
    [0.64, 0.76],
  ]

  let windows = ""
  for (const [u1, u2] of columns) {
    for (const [v1, v2] of rows) {
      windows += faceQuad(frontTop, rightU, down, u1, u2, v1, v2, DETAIL)
    }
  }
  for (const [v1, v2] of rows) {
    windows += faceQuad(frontTop, leftU, down, 0.34, 0.5, v1, v2, DETAIL)
  }

  return `<g class="building">${body}${cap}${windows}</g>`
}

function treeMarkup(seed: number): string {
  const scale = 0.86 + (seed % 3) * 0.09
  const trunk = box({
    rx: 4,
    ry: 2,
    h: 9,
    top: "#55534e",
    left: "#46443f",
    right: "#33322e",
  })

  const baseY = -9
  const apexY = baseY - (18 + (seed % 2) * 4)
  const canopyLeft = polygon([[-14, baseY], [0, baseY + 7], [0, apexY]], "#4a4844")
  const canopyRight = polygon([[0, baseY + 7], [14, baseY], [0, apexY]], "#32312e")

  return `<g class="building" transform="scale(${scale})">${trunk}${canopyLeft}${canopyRight}</g>`
}

function buildingMarkup(cell: Structure, seed: number): string {
  switch (cell) {
    case "house":
      return houseMarkup(seed)
    case "tower":
      return towerMarkup(seed)
    case "tree":
      return treeMarkup(seed)
    default:
      return ""
  }
}

/* ---------- state ---------- */

const structures = new Map<string, Structure>()
const water = new Set<string>()

const hasWater = (gx: number, gy: number): boolean => water.has(tileKey(gx, gy))

const isRoad = (gx: number, gy: number): boolean =>
  structures.get(tileKey(gx, gy)) === "road"

function roadMarkup(gx: number, gy: number): string {
  const connectors: Array<[number, number, number, number]> = [
    [1, 0, 16, 8],
    [-1, 0, -16, -8],
    [0, 1, -16, 8],
    [0, -1, 16, -8],
  ]

  let lines = ""
  for (const [dx, dy, x2, y2] of connectors) {
    if (isRoad(gx + dx, gy + dy)) {
      lines += `<line x1="0" y1="0" x2="${x2}" y2="${y2}"/>`
    }
  }

  return `<g class="road-mark">${lines}</g>`
}

function waterDetailMarkup(gx: number, gy: number): string {
  const inset = 0.93
  let detail = ""

  if (!hasWater(gx + 1, gy)) {
    detail += `<line class="water-bank" x1="${32 * inset}" y1="0" x2="0" y2="${16 * inset}"/>`
  }
  if (!hasWater(gx - 1, gy)) {
    detail += `<line class="water-bank" x1="0" y1="${-16 * inset}" x2="${-32 * inset}" y2="0"/>`
  }
  if (!hasWater(gx, gy + 1)) {
    detail += `<line class="water-bank" x1="${-32 * inset}" y1="0" x2="0" y2="${16 * inset}"/>`
  }
  if (!hasWater(gx, gy - 1)) {
    detail += `<line class="water-bank" x1="0" y1="${-16 * inset}" x2="${32 * inset}" y2="0"/>`
  }

  const seed = hashCell(gx, gy)
  if (seed % 3 === 0) {
    const wx = (seed % 9) - 4
    const wy = ((seed >> 4) % 9) - 5
    detail += `<path class="water-wave" d="M-4 0q2-1.8 4 0t4 0" transform="translate(${wx} ${wy})"/>`
  }

  return detail
}

function bridgeMarkup(gx: number, gy: number): string {
  const xRoads = Number(isRoad(gx - 1, gy)) + Number(isRoad(gx + 1, gy))
  const yRoads = Number(isRoad(gx, gy - 1)) + Number(isRoad(gx, gy + 1))
  const alongX = yRoads <= xRoads

  const a: Point = alongX ? [16, 8] : [-16, 8]
  const b: Point = alongX ? [-22, 11] : [22, 11]

  const q1: Point = [-a[0] + b[0], -a[1] + b[1]]
  const q2: Point = [a[0] + b[0], a[1] + b[1]]
  const q3: Point = [a[0] - b[0], a[1] - b[1]]
  const q4: Point = [-a[0] - b[0], -a[1] - b[1]]
  const deckPoints = points([q1, q2, q3, q4])

  const bLen = Math.hypot(b[0], b[1])
  const inward: Point = [(-b[0] / bLen) * 2, (-b[1] / bLen) * 2]

  const rail1From: Point = [q1[0] + inward[0], q1[1] + inward[1]]
  const rail1To: Point = [q2[0] + inward[0], q2[1] + inward[1]]
  const rail2From: Point = [q3[0] - inward[0], q3[1] - inward[1]]
  const rail2To: Point = [q4[0] - inward[0], q4[1] - inward[1]]

  return (
    `<polygon points="${deckPoints}" transform="translate(0 3)" fill="#000000" opacity="0.16"/>` +
    `<polygon class="bridge-deck" points="${deckPoints}" fill="${BRIDGE}"/>` +
    lineMarkup(rail1From, rail1To, "bridge-rail") +
    lineMarkup(rail2From, rail2To, "bridge-rail")
  )
}

function tileMarkup(gx: number, gy: number, cell: Structure | undefined, isWater: boolean): string {
  const needsGround = isWater || cell === "road"
  let inner = ""

  if (needsGround) {
    const fill = isWater ? WATER : ROAD
    const classes = `tile-ground${isWater ? " water-ground" : ""}`
    inner += `<polygon class="${classes}" points="0,-16 32,0 0,16 -32,0" fill="${fill}"/>`
    if (isWater) inner += waterDetailMarkup(gx, gy)
  }

  if (cell === "road") {
    if (isWater) inner += bridgeMarkup(gx, gy)
    inner += roadMarkup(gx, gy)
  } else if (cell) {
    inner += buildingMarkup(cell, hashCell(gx, gy))
  }

  return `<g class="tile" data-gx="${gx}" data-gy="${gy}" transform="translate(${isoX(gx, gy)} ${isoY(gx, gy)})">${inner}</g>`
}

/* ---------- camera ---------- */

interface Camera extends Vec {
  zoom: number
}

interface ViewBoxRect {
  x: number
  y: number
  w: number
  h: number
}

const camera: Camera = { x: INITIAL_CENTER.x, y: INITIAL_CENTER.y, zoom: 1 }
let view: ViewBoxRect = { x: -500, y: -90, w: 1000, h: 500 }
let stageW = 0
let stageH = 0
let viewReady = false
let renderQueued = false

function visibleBounds(): { minGx: number; maxGx: number; minGy: number; maxGy: number } {
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity

  for (const x of [view.x, view.x + view.w]) {
    for (const y of [view.y, view.y + view.h]) {
      const u = x / TILE_W + y / TILE_H
      const v = -x / TILE_W + y / TILE_H
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
  }

  return {
    minGx: Math.floor(minU) - RENDER_MARGIN,
    maxGx: Math.ceil(maxU) + RENDER_MARGIN,
    minGy: Math.floor(minV) - RENDER_MARGIN,
    maxGy: Math.ceil(maxV) + RENDER_MARGIN,
  }
}

function renderTiles(): void {
  if (!viewReady) return

  const bounds = visibleBounds()
  const items: Array<{ gx: number; gy: number; cell: Structure | undefined; isWater: boolean }> = []

  for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++) {
    for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
      const key = tileKey(gx, gy)
      const cell = structures.get(key)
      const isWater = water.has(key)
      if (!cell && !isWater) continue
      items.push({ gx, gy, cell, isWater })
    }
  }

  items.sort((a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gx - b.gx)

  tilesGroup.innerHTML = items
    .map(({ gx, gy, cell, isWater }) => tileMarkup(gx, gy, cell, isWater))
    .join("")
}

function requestRender(): void {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderTiles()
  })
}

function commitCamera(): void {
  if (!viewReady) return

  const w = stageW / camera.zoom
  const h = stageH / camera.zoom
  view = { x: camera.x - w / 2, y: camera.y - h / 2, w, h }

  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`)
  ground.setAttribute("x", String(view.x - 160))
  ground.setAttribute("y", String(view.y - 160))
  ground.setAttribute("width", String(view.w + 320))
  ground.setAttribute("height", String(view.h + 320))

  const percent = `${Math.round(camera.zoom * 100)}%`
  zoomReset.textContent = percent
  zoomReset.title = `Reset view (${percent})`

  requestRender()
}

function resetView(): void {
  camera.x = INITIAL_CENTER.x
  camera.y = INITIAL_CENTER.y
  camera.zoom = clamp(stageW / 1000, 0.7, 1.5)
  commitCamera()
}

function zoomAt(clientX: number, clientY: number, nextZoom: number): void {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  if (Math.abs(zoom - camera.zoom) < 0.0001) return

  const rect = svg.getBoundingClientRect()
  const dx = clientX - rect.left - rect.width / 2
  const dy = clientY - rect.top - rect.height / 2
  const worldX = camera.x + dx / camera.zoom
  const worldY = camera.y + dy / camera.zoom

  camera.zoom = zoom
  camera.x = worldX - dx / zoom
  camera.y = worldY - dy / zoom
  commitCamera()
}

function zoomBy(factor: number): void {
  const rect = svg.getBoundingClientRect()
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, camera.zoom * factor)
}

function stageContains(clientX: number, clientY: number): boolean {
  const rect = svg.getBoundingClientRect()
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  )
}

function tileAtClient(clientX: number, clientY: number): Tile {
  const rect = svg.getBoundingClientRect()
  const worldX = view.x + ((clientX - rect.left) / rect.width) * view.w
  const worldY = view.y + ((clientY - rect.top) / rect.height) * view.h

  return {
    gx: Math.round(worldX / TILE_W + worldY / TILE_H),
    gy: Math.round(-worldX / TILE_W + worldY / TILE_H),
  }
}

/* ---------- dom ---------- */

const stage = document.querySelector<HTMLElement>(".stage")
if (!stage) throw new Error("Missing .stage")

const svg = element<SVGSVGElement>("city")
const ground = element<SVGRectElement>("ground")
const tilesGroup = element<SVGGElement>("tiles")
const hoverGroup = element<SVGGElement>("hover")
const ghostGroup = element<SVGGElement>("ghost")
const builtCount = element<HTMLElement>("built-count")
const popCount = element<HTMLElement>("pop-count")
const clearButton = element<HTMLButtonElement>("clear")
const saveStatus = element<HTMLElement>("save-status")
const saveLabel = element<HTMLElement>("save-label")
const panToggle = element<HTMLButtonElement>("pan-toggle")
const zoomOut = element<HTMLButtonElement>("zoom-out")
const zoomIn = element<HTMLButtonElement>("zoom-in")
const zoomReset = element<HTMLButtonElement>("zoom-reset")
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tool"))

/* ---------- app state ---------- */

let tool: Tool = "house"
let panMode = false
let spaceDown = false
let painting = false
let panning = false
let hoverTile: Tile | null = null
let lastPainted: string | null = null

let panStart: {
  x: number
  y: number
  camX: number
  camY: number
  zoom: number
} | null = null

/* ---------- persistence ---------- */

interface SavedCity {
  version: 2
  structures: Array<[string, Structure]>
  water: string[]
}

function isSavedCity(value: unknown): value is SavedCity {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    record.version === 2 &&
    Array.isArray(record.structures) &&
    Array.isArray(record.water)
  )
}

function loadSavedCity(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const data: unknown = JSON.parse(raw)
      if (isSavedCity(data)) {
        for (const entry of data.structures) {
          if (!Array.isArray(entry) || entry.length !== 2) continue
          const [key, value] = entry
          if (typeof key !== "string" || !KEY_RE.test(key) || !isStructure(value)) continue
          structures.set(key, value)
        }
        for (const key of data.water) {
          if (typeof key === "string" && KEY_RE.test(key)) water.add(key)
        }
        return true
      }
    }

    // Migrate the original 12 × 12 city, if there is one.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const array: unknown = JSON.parse(legacy)
      if (Array.isArray(array) && array.length === 144) {
        array.forEach((value, index) => {
          if (isStructure(value)) {
            structures.set(tileKey(index % 12, Math.floor(index / 12)), value)
          }
        })
        addRiver(true)
        return true
      }
    }
  } catch {
    // Corrupt or unavailable storage falls through to a fresh city.
  }

  return false
}

function addRiver(avoidStructures = false): void {
  for (let gy = -80; gy <= 120; gy++) {
    const center = 9 + Math.round(Math.sin((gy - 5) / 6) * 2)
    const left = tileKey(center, gy)
    const right = tileKey(center + 1, gy)

    if (!avoidStructures || !structures.has(left) || structures.get(left) === "road") {
      water.add(left)
    }
    if (!avoidStructures || !structures.has(right) || structures.get(right) === "road") {
      water.add(right)
    }
  }
}

function persist(): void {
  try {
    const payload: SavedCity = {
      version: 2,
      structures: Array.from(structures.entries()),
      water: Array.from(water),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    saveStatus.classList.remove("error")
    saveLabel.textContent = "saved"
  } catch {
    saveStatus.classList.add("error")
    saveLabel.textContent = "not saved"
  }
}

function starterCity(): void {
  structures.clear()
  water.clear()

  // A two-tile-wide river meandering north to south.
  addRiver()

  const road = (gx: number, gy: number): void => {
    structures.set(tileKey(gx, gy), "road")
  }
  const build = (gx: number, gy: number, cell: Structure): void => {
    structures.set(tileKey(gx, gy), cell)
  }

  for (let gx = 0; gx <= 14; gx++) road(gx, 5)
  for (let gy = 0; gy <= 10; gy++) road(5, gy)

  build(4, 4, "house")
  build(6, 4, "house")
  build(4, 6, "house")
  build(6, 7, "house")
  build(11, 4, "house")
  build(13, 7, "house")

  build(3, 3, "tower")
  build(8, 8, "tower")

  build(2, 2, "tree")
  build(8, 3, "tree")
  build(3, 9, "tree")
  build(7, 9, "tree")
  build(8, 10, "tree")
  build(14, 3, "tree")
}

function updateStats(): void {
  let people = 0
  for (const cell of structures.values()) people += POPULATION[cell]

  builtCount.textContent = String(structures.size).padStart(2, "0")
  popCount.textContent = String(people).padStart(3, "0")
}

/* ---------- editing ---------- */

function wouldChangeAt(tile: Tile): boolean {
  const key = tileKey(tile.gx, tile.gy)
  const cell = structures.get(key)
  const isWater = water.has(key)

  if (tool === "erase") return Boolean(cell) || isWater
  if (tool === "water") return Boolean(cell) || !isWater
  if (tool === "road") return cell !== "road"
  return cell !== tool || isWater
}

function placeTile(tile: Tile): void {
  const key = tileKey(tile.gx, tile.gy)
  const cell = structures.get(key)
  const isWater = water.has(key)
  let changed = false

  if (tool === "erase") {
    if (cell) {
      structures.delete(key)
      changed = true
    } else if (isWater) {
      water.delete(key)
      changed = true
    }
  } else if (tool === "water") {
    if (cell) {
      structures.delete(key)
      changed = true
    }
    if (!isWater) {
      water.add(key)
      changed = true
    }
  } else {
    if (cell !== tool) {
      structures.set(key, tool)
      changed = true
    }
    if (tool !== "road" && isWater) {
      water.delete(key)
      changed = true
    }
  }

  if (!changed) return

  persist()
  updateStats()
  requestRender()
  updateGhost()
}

function eraseTile(tile: Tile): void {
  const key = tileKey(tile.gx, tile.gy)
  if (structures.delete(key)) {
    persist()
    updateStats()
    requestRender()
    updateGhost()
    return
  }
  if (water.delete(key)) {
    persist()
    updateStats()
    requestRender()
    updateGhost()
  }
}

/* ---------- hover + preview ---------- */

function setHover(next: Tile | null): void {
  if (
    next === null
      ? hoverTile === null
      : hoverTile !== null && hoverTile.gx === next.gx && hoverTile.gy === next.gy
  ) {
    return
  }

  hoverTile = next
  updateHover()
  updateGhost()
}

function updateHover(): void {
  if (!hoverTile || panMode || spaceDown || panning) {
    hoverGroup.style.display = "none"
    return
  }

  hoverGroup.setAttribute(
    "transform",
    `translate(${isoX(hoverTile.gx, hoverTile.gy)} ${isoY(hoverTile.gx, hoverTile.gy)})`,
  )
  hoverGroup.style.display = ""
}

function updateGhost(): void {
  if (!hoverTile || panMode || spaceDown || panning || !wouldChangeAt(hoverTile)) {
    ghostGroup.innerHTML = ""
    return
  }

  const { gx, gy } = hoverTile
  const key = tileKey(gx, gy)
  const isWater = water.has(key)
  const outline = `<polygon class="ghost-outline" points="0,-16 32,0 0,16 -32,0"/>`

  let content = ""

  if (tool === "erase") {
    content =
      `<polygon class="ghost-pad" points="0,-14 28,0 0,14 -28,0"/>` +
      `<path class="ghost-x" d="M-8,-4 L8,4 M8,-4 L-8,4"/>`
  } else if (tool === "water") {
    content =
      `<polygon class="tile-ground water-ground" points="0,-16 32,0 0,16 -32,0" fill="${WATER}"/>` +
      waterDetailMarkup(gx, gy) +
      outline
  } else if (tool === "road") {
    if (isWater) {
      content =
        `<polygon class="tile-ground water-ground" points="0,-16 32,0 0,16 -32,0" fill="${WATER}"/>` +
        waterDetailMarkup(gx, gy) +
        bridgeMarkup(gx, gy)
    } else {
      content = `<polygon class="tile-ground" points="0,-16 32,0 0,16 -32,0" fill="${ROAD}"/>`
    }
    content += roadMarkup(gx, gy) + outline
  } else {
    if (isWater) {
      content = `<polygon class="tile-ground" points="0,-16 32,0 0,16 -32,0" fill="${LAND}"/>`
    }
    content += buildingMarkup(tool, hashCell(gx, gy)) + outline
  }

  ghostGroup.setAttribute("transform", `translate(${isoX(gx, gy)} ${isoY(gx, gy)})`)
  ghostGroup.innerHTML = content
}

/* ---------- tools + controls ---------- */

function selectTool(next: Tool): void {
  tool = next

  if (panMode) {
    panMode = false
    panToggle.setAttribute("aria-pressed", "false")
  }

  for (const button of toolButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === next))
  }

  updateCursor()
  updateGhost()
}

function setPanMode(active: boolean): void {
  panMode = active
  panToggle.setAttribute("aria-pressed", String(active))
  updateCursor()

  if (active) {
    setHover(null)
  } else {
    updateGhost()
  }
}

function updateCursor(): void {
  svg.classList.toggle("is-pan", panMode || spaceDown)
  svg.classList.toggle("is-grabbing", panning)
}

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    const value = button.dataset.tool
    if (
      value === "road" ||
      value === "house" ||
      value === "tower" ||
      value === "tree" ||
      value === "water" ||
      value === "erase"
    ) {
      selectTool(value)
    }
  })
}

panToggle.addEventListener("click", () => {
  setPanMode(!panMode)
})

zoomOut.addEventListener("click", () => {
  zoomBy(0.8)
})

zoomIn.addEventListener("click", () => {
  zoomBy(1.25)
})

zoomReset.addEventListener("click", () => {
  resetView()
})

clearButton.addEventListener("click", () => {
  if (structures.size === 0) return
  if (!window.confirm("Clear all buildings and roads? The river stays.")) return

  structures.clear()
  persist()
  updateStats()
  requestRender()
  updateGhost()
})

/* ---------- pointer helpers ---------- */

function paintAtClient(clientX: number, clientY: number): void {
  if (!stageContains(clientX, clientY)) return

  const tile = tileAtClient(clientX, clientY)
  const key = tileKey(tile.gx, tile.gy)
  if (lastPainted === key) return

  lastPainted = key
  placeTile(tile)
}

function startPan(clientX: number, clientY: number): void {
  painting = false
  lastPainted = null
  panning = true
  panStart = {
    x: clientX,
    y: clientY,
    camX: camera.x,
    camY: camera.y,
    zoom: camera.zoom,
  }
  setHover(null)
  updateCursor()
}

function endPan(): void {
  panning = false
  panStart = null
  updateCursor()
}

/* ---------- mouse + pen ---------- */

svg.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") {
    onTouchDown(event)
    return
  }

  if (event.ctrlKey) return

  const wantsPan = event.button === 1 || (event.button === 0 && (panMode || spaceDown))

  if (wantsPan) {
    event.preventDefault()
    svg.setPointerCapture(event.pointerId)
    startPan(event.clientX, event.clientY)
    return
  }

  if (event.button !== 0) return

  event.preventDefault()
  svg.setPointerCapture(event.pointerId)
  painting = true
  lastPainted = null
  paintAtClient(event.clientX, event.clientY)
  setHover(tileAtClient(event.clientX, event.clientY))
})

svg.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || painting || panning) return
  if (!stageContains(event.clientX, event.clientY)) {
    setHover(null)
    return
  }
  setHover(tileAtClient(event.clientX, event.clientY))
})

svg.addEventListener("pointerleave", () => {
  if (!painting && !panning) setHover(null)
})

svg.addEventListener("pointerenter", () => {
  // Clear button focus after mouse use so Space can start a temporary pan.
  if (document.activeElement instanceof HTMLButtonElement) {
    document.activeElement.blur()
  }
})

window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    onTouchMove(event)
    return
  }

  if (panning && panStart) {
    camera.x = panStart.camX - (event.clientX - panStart.x) / panStart.zoom
    camera.y = panStart.camY - (event.clientY - panStart.y) / panStart.zoom
    commitCamera()
    return
  }

  if (painting) {
    paintAtClient(event.clientX, event.clientY)
    if (stageContains(event.clientX, event.clientY)) {
      setHover(tileAtClient(event.clientX, event.clientY))
    }
  }
})

window.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") {
    onTouchUp(event)
    return
  }
  if (panning) endPan()
  painting = false
  lastPainted = null
})

window.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") {
    onTouchCancel(event)
    return
  }
  if (panning) endPan()
  painting = false
  lastPainted = null
})

svg.addEventListener("contextmenu", (event) => {
  event.preventDefault()
  if (event.button !== 2) return
  if (!stageContains(event.clientX, event.clientY)) return
  eraseTile(tileAtClient(event.clientX, event.clientY))
})

svg.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault()

    let delta = event.deltaY
    if (event.deltaMode === 1) delta *= 16
    else if (event.deltaMode === 2) delta *= stageH

    const factor = Math.exp(-delta * 0.0015)
    zoomAt(event.clientX, event.clientY, camera.zoom * factor)
  },
  { passive: false },
)

/* ---------- touch ---------- */

type TouchMode = "idle" | "candidate" | "paint" | "pan" | "pinch"

const touchPoints = new Map<number, Vec>()
let touchMode: TouchMode = "idle"
let touchStart: Vec | null = null
let touchPanStart: { x: number; y: number; camX: number; camY: number; zoom: number } | null = null
let pinchStart: { dist: number; worldX: number; worldY: number; zoom: number } | null = null
let touchSuppressed = false

function beginPinch(): void {
  const values = Array.from(touchPoints.values())
  if (values.length < 2) return

  const [a, b] = values
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return

  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const rect = svg.getBoundingClientRect()
  const offX = midX - rect.left - rect.width / 2
  const offY = midY - rect.top - rect.height / 2

  pinchStart = {
    dist,
    worldX: camera.x + offX / camera.zoom,
    worldY: camera.y + offY / camera.zoom,
    zoom: camera.zoom,
  }
}

function updatePinch(): void {
  if (!pinchStart || touchPoints.size < 2) return

  const values = Array.from(touchPoints.values())
  const [a, b] = values
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return

  const zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), MIN_ZOOM, MAX_ZOOM)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const rect = svg.getBoundingClientRect()
  const offX = midX - rect.left - rect.width / 2
  const offY = midY - rect.top - rect.height / 2

  camera.zoom = zoom
  camera.x = pinchStart.worldX - offX / zoom
  camera.y = pinchStart.worldY - offY / zoom
  commitCamera()
}

function onTouchDown(event: PointerEvent): void {
  event.preventDefault()

  if (touchPoints.size === 0) touchSuppressed = false
  touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
  svg.setPointerCapture(event.pointerId)

  if (touchPoints.size === 1) {
    setHover(null)

    if (panMode) {
      touchMode = "pan"
      touchPanStart = {
        x: event.clientX,
        y: event.clientY,
        camX: camera.x,
        camY: camera.y,
        zoom: camera.zoom,
      }
    } else if (!touchSuppressed) {
      touchMode = "candidate"
      touchStart = { x: event.clientX, y: event.clientY }
    }
    return
  }

  if (touchPoints.size === 2) {
    painting = false
    lastPainted = null
    touchMode = "pinch"
    touchStart = null
    touchPanStart = null
    beginPinch()
  }
}

function onTouchMove(event: PointerEvent): void {
  const point = touchPoints.get(event.pointerId)
  if (!point) return

  point.x = event.clientX
  point.y = event.clientY

  if (touchSuppressed && touchMode === "idle") return

  if (touchMode === "pinch" && touchPoints.size >= 2) {
    updatePinch()
    return
  }

  if (touchMode === "pan" && touchPanStart) {
    camera.x = touchPanStart.camX - (event.clientX - touchPanStart.x) / touchPanStart.zoom
    camera.y = touchPanStart.camY - (event.clientY - touchPanStart.y) / touchPanStart.zoom
    commitCamera()
    return
  }

  if (touchMode === "candidate" && touchStart) {
    const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y)
    if (moved > 7) {
      touchMode = "paint"
      painting = true
      lastPainted = null
      paintAtClient(event.clientX, event.clientY)
    }
    return
  }

  if (touchMode === "paint") {
    paintAtClient(event.clientX, event.clientY)
  }
}

function finishTouch(): void {
  touchPoints.clear()
  touchMode = "idle"
  touchStart = null
  touchPanStart = null
  pinchStart = null
  touchSuppressed = false
  painting = false
  lastPainted = null
}

function onTouchUp(event: PointerEvent): void {
  const wasCandidate = touchMode === "candidate"
  const candidate = touchStart

  touchPoints.delete(event.pointerId)

  if (wasCandidate && touchPoints.size === 0 && candidate) {
    if (stageContains(candidate.x, candidate.y)) {
      placeTile(tileAtClient(candidate.x, candidate.y))
    }
    finishTouch()
    return
  }

  if (touchMode === "pinch" && touchPoints.size < 2) {
    painting = false
    lastPainted = null
    touchMode = "idle"
    pinchStart = null
    touchSuppressed = true
  }

  if (touchPoints.size === 0) {
    finishTouch()
    return
  }

  if (touchMode === "paint") {
    painting = false
    lastPainted = null
    touchMode = "idle"
    touchSuppressed = true
  }

  if (touchMode === "pan") {
    touchPanStart = null
    touchMode = "idle"
    touchSuppressed = true
  }
}

function onTouchCancel(event: PointerEvent): void {
  touchPoints.delete(event.pointerId)

  if (touchPoints.size === 0) {
    finishTouch()
    return
  }

  painting = false
  lastPainted = null
  touchMode = "idle"
  pinchStart = null
  touchPanStart = null
  touchSuppressed = true
}

/* ---------- keyboard ---------- */

const KEY_TOOLS: Record<string, Tool> = {
  "1": "road",
  "2": "house",
  "3": "tower",
  "4": "tree",
  w: "water",
  x: "erase",
  e: "erase",
}

function isFormTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  )
}

window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || isFormTarget(event.target)) return

  const next = KEY_TOOLS[event.key.toLowerCase()]
  if (next) {
    event.preventDefault()
    selectTool(next)
    return
  }

  if (event.key.toLowerCase() === "h") {
    event.preventDefault()
    setPanMode(!panMode)
    return
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault()
    zoomBy(1.2)
    return
  }

  if (event.key === "-" || event.key === "_") {
    event.preventDefault()
    zoomBy(1 / 1.2)
    return
  }

  if (event.key === "0") {
    event.preventDefault()
    resetView()
    return
  }

  if (event.code === "Space") {
    if (event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    if (!spaceDown) {
      spaceDown = true
      updateCursor()
      setHover(null)
    }
  }
})

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spaceDown = false
    updateCursor()
    updateGhost()
  }
})

window.addEventListener("blur", () => {
  spaceDown = false
  painting = false
  lastPainted = null
  if (panning) endPan()
  updateCursor()
  finishTouch()
})

/* ---------- boot ---------- */

hoverGroup.innerHTML = `<polygon class="hover-ring" points="0,-13 27,0 0,13 -27,0"/>`
hoverGroup.style.display = "none"

if (!loadSavedCity()) {
  starterCity()
}

updateStats()
selectTool("house")
persist()

const resizeObserver = new ResizeObserver(() => {
  const width = stage.clientWidth
  const height = stage.clientHeight
  if (!width || !height) return

  stageW = width
  stageH = height

  if (!viewReady) {
    viewReady = true
    resetView()
  } else {
    commitCamera()
  }
})

// Measure immediately so the first frame is already framed correctly.
if (stage.clientWidth > 0 && stage.clientHeight > 0) {
  stageW = stage.clientWidth
  stageH = stage.clientHeight
  viewReady = true
  resetView()
}

resizeObserver.observe(stage)
