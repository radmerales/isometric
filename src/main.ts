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
const THEME_KEY = "isocity:theme"
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

const LAND = "var(--land)"
const WATER = "var(--water)"
const ROAD = "var(--road)"
const BRIDGE = "var(--bridge)"
const ACCENT = "var(--roof)"
const ACCENT_DARK = "var(--roof-dark)"
const LAKE_ROOF = "var(--lake-roof)"
const LAKE_ROOF_DARK = "var(--lake-roof-dark)"
const LAKE_GLASS = "var(--lake-glass)"
const DECK = "var(--deck)"

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

const addPoint = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]
const scalePoint = (a: Point, factor: number): Point => [a[0] * factor, a[1] * factor]
const lerpPoint = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

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

function houseMarkup(seed: number, lakehouse: boolean): string {
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
    top: "var(--wall-top)",
    left: "var(--wall-left)",
    right: "var(--wall-right)",
  })

  const roofLeft = polygon([[-rx, wallTop], frontTop, apex], lakehouse ? LAKE_ROOF : ACCENT)
  const roofRight = polygon([frontTop, [rx, wallTop], apex], lakehouse ? LAKE_ROOF_DARK : ACCENT_DARK)

  const rightU: Point = [rx, -ry]
  const rightV: Point = [0, wallHeight]
  const door = faceQuad(frontTop, rightU, rightV, 0.55, 0.78, 0.3, 1, "var(--door)")

  const leftU: Point = [-rx, -ry]
  const window = faceQuad(
    frontTop,
    leftU,
    rightV,
    0.34,
    0.52,
    0.26,
    0.5,
    lakehouse ? LAKE_GLASS : "var(--window)",
  )

  const deck = lakehouse ? lakeDeckMarkup(rx, ry) : ""

  return `<g class="building house${lakehouse ? " lakehouse" : ""}">${walls}${roofLeft}${roofRight}${door}${window}${deck}</g>`
}

function lakeDeckMarkup(rx: number, ry: number): string {
  const length = Math.hypot(ry, rx)
  const depth = 4.5
  const nx = (ry / length) * depth
  const ny = (rx / length) * depth

  const front: Point = [0, ry]
  const right: Point = [rx, 0]
  const frontOuter: Point = [nx, ry + ny]
  const rightOuter: Point = [rx + nx, ny]

  let planks = ""
  for (const t of [0.4, 0.72]) {
    planks += lineMarkup(lerpPoint(front, frontOuter, t), lerpPoint(right, rightOuter, t), "lake-plank")
  }

  const rail = lineMarkup(
    [frontOuter[0], frontOuter[1] - 3.5],
    [rightOuter[0], rightOuter[1] - 3.5],
    "lake-rail",
  )
  const posts = [
    lineMarkup(frontOuter, [frontOuter[0], frontOuter[1] - 3.5], "lake-post"),
    lineMarkup(rightOuter, [rightOuter[0], rightOuter[1] - 3.5], "lake-post"),
  ].join("")

  return (
    `<polygon class="lake-deck" points="${points([front, right, rightOuter, frontOuter])}" fill="${DECK}"/>` +
    planks +
    posts +
    rail
  )
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
    top: "var(--tower-top)",
    left: "var(--tower-left)",
    right: "var(--tower-right)",
  })

  const cap = box({
    rx: 13,
    ry: 7,
    h: capHeight,
    y: topY,
    top: ACCENT,
    left: "var(--cap-left)",
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
      windows += faceQuad(frontTop, rightU, down, u1, u2, v1, v2, "var(--window)")
    }
  }
  for (const [v1, v2] of rows) {
    windows += faceQuad(frontTop, leftU, down, 0.34, 0.5, v1, v2, "var(--window)")
  }

  return `<g class="building">${body}${cap}${windows}</g>`
}

function treeMarkup(seed: number): string {
  const scale = 0.86 + (seed % 3) * 0.09
  const trunk = box({
    rx: 4,
    ry: 2,
    h: 9,
    top: "var(--tree-trunk-top)",
    left: "var(--tree-trunk-left)",
    right: "var(--tree-trunk-right)",
  })

  const baseY = -9
  const apexY = baseY - (18 + (seed % 2) * 4)
  const canopyLeft = polygon([[-14, baseY], [0, baseY + 7], [0, apexY]], "var(--tree-light)")
  const canopyRight = polygon([[0, baseY + 7], [14, baseY], [0, apexY]], "var(--tree-dark)")

  return `<g class="building" transform="scale(${scale})">${trunk}${canopyLeft}${canopyRight}</g>`
}

function buildingMarkup(cell: Structure, seed: number, lakehouse = false): string {
  switch (cell) {
    case "house":
      return houseMarkup(seed, lakehouse)
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

function isNearWater(gx: number, gy: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue
      if (hasWater(gx + dx, gy + dy)) return true
    }
  }
  return false
}

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

function flatMarkup(gx: number, gy: number, cell: Structure | undefined, isWater: boolean): string {
  const needsGround = isWater || cell === "road"
  if (!needsGround) return ""

  let inner = ""
  const fill = isWater ? WATER : ROAD
  const classes = `tile-ground${isWater ? " water-ground" : ""}`
  inner += `<polygon class="${classes}" points="0,-16 32,0 0,16 -32,0" fill="${fill}"/>`
  if (isWater) inner += waterDetailMarkup(gx, gy)

  if (cell === "road") {
    if (isWater) inner += bridgeMarkup(gx, gy)
    inner += roadMarkup(gx, gy)
  }

  return `<g class="flat-tile" data-gx="${gx}" data-gy="${gy}" transform="translate(${isoX(gx, gy)} ${isoY(gx, gy)})">${inner}</g>`
}

function objectMarkup(gx: number, gy: number, cell: Structure | undefined): string {
  if (!cell || cell === "road") return ""

  const lakehouse = cell === "house" && isNearWater(gx, gy)
  const content = buildingMarkup(cell, hashCell(gx, gy), lakehouse)

  return `<g class="tile-object" data-gx="${gx}" data-gy="${gy}" transform="translate(${isoX(gx, gy)} ${isoY(gx, gy)})">${content}</g>`
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

  const flats: string[] = []
  const objects: string[] = []

  for (const { gx, gy, cell, isWater } of items) {
    flats.push(flatMarkup(gx, gy, cell, isWater))
    objects.push(objectMarkup(gx, gy, cell))
  }

  flatsGroup.innerHTML = flats.join("")
  objectsGroup.innerHTML = objects.join("")
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
const flatsGroup = element<SVGGElement>("flats")
const carsGroup = element<SVGGElement>("cars")
const objectsGroup = element<SVGGElement>("objects")
const hoverGroup = element<SVGGElement>("hover")
const ghostGroup = element<SVGGElement>("ghost")
const builtCount = element<HTMLElement>("built-count")
const popCount = element<HTMLElement>("pop-count")
const clearButton = element<HTMLButtonElement>("clear")
const generateButton = element<HTMLButtonElement>("generate")
const themeToggle = element<HTMLButtonElement>("theme-toggle")
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

/* ---------- auto-build ---------- */

const GENERATE_RADIUS = 8
const STREET_STEP = 5

const mod = (value: number, step: number): number => ((value % step) + step) % step

const isEmptyLand = (gx: number, gy: number): boolean => {
  const key = tileKey(gx, gy)
  return !structures.has(key) && !water.has(key)
}

function hasRoadNeighbor(gx: number, gy: number): boolean {
  return (
    isRoad(gx + 1, gy) ||
    isRoad(gx - 1, gy) ||
    isRoad(gx, gy + 1) ||
    isRoad(gx, gy - 1)
  )
}

/**
 * Fill a 17 × 17 district around the view centre. The district is anchored to
 * a 5-tile street lattice: empty street-line tiles become roads, short water
 * gaps on a street become bridges, street-facing plots become houses, one
 * corner of each block becomes a tower, and the remaining courts become trees.
 * Existing structures are untouched.
 */
function autoBuild(): void {
  const rect = svg.getBoundingClientRect()
  const center = tileAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2)
  const centerGx = Math.round(center.gx / STREET_STEP) * STREET_STEP
  const centerGy = Math.round(center.gy / STREET_STEP) * STREET_STEP
  const minGx = centerGx - GENERATE_RADIUS
  const maxGx = centerGx + GENERATE_RADIUS
  const minGy = centerGy - GENERATE_RADIUS
  const maxGy = centerGy + GENERATE_RADIUS

  let added = 0
  const put = (gx: number, gy: number, cell: Structure): void => {
    structures.set(tileKey(gx, gy), cell)
    added += 1
  }

  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (!isEmptyLand(gx, gy)) continue
      if (mod(gx, STREET_STEP) === 0 || mod(gy, STREET_STEP) === 0) {
        put(gx, gy, "road")
      }
    }
  }

  // Short water gaps on a street line become bridges, connecting both banks.
  for (let gy = minGy; gy <= maxGy; gy++) {
    if (mod(gy, STREET_STEP) !== 0) continue
    let gx = minGx
    while (gx <= maxGx) {
      const key = tileKey(gx, gy)
      if (!water.has(key) || structures.has(key)) {
        gx += 1
        continue
      }

      let end = gx
      while (end + 1 <= maxGx) {
        const nextKey = tileKey(end + 1, gy)
        if (!water.has(nextKey) || structures.has(nextKey)) break
        end += 1
      }

      if (
        isRoad(gx - 1, gy) &&
        !hasWater(gx - 1, gy) &&
        isRoad(end + 1, gy) &&
        !hasWater(end + 1, gy) &&
        end - gx + 1 <= 3
      ) {
        for (let x = gx; x <= end; x++) put(x, gy, "road")
      }
      gx = end + 1
    }
  }

  for (let gx = minGx; gx <= maxGx; gx++) {
    if (mod(gx, STREET_STEP) !== 0) continue
    let gy = minGy
    while (gy <= maxGy) {
      const key = tileKey(gx, gy)
      if (!water.has(key) || structures.has(key)) {
        gy += 1
        continue
      }

      let end = gy
      while (end + 1 <= maxGy) {
        const nextKey = tileKey(gx, end + 1)
        if (!water.has(nextKey) || structures.has(nextKey)) break
        end += 1
      }

      if (
        isRoad(gx, gy - 1) &&
        !hasWater(gx, gy - 1) &&
        isRoad(gx, end + 1) &&
        !hasWater(gx, end + 1) &&
        end - gy + 1 <= 3
      ) {
        for (let y = gy; y <= end; y++) put(gx, y, "road")
      }
      gy = end + 1
    }
  }

  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (!isEmptyLand(gx, gy)) continue

      if (hasRoadNeighbor(gx, gy)) {
        const corner = mod(gx, STREET_STEP) === 1 && mod(gy, STREET_STEP) === 1
        put(gx, gy, corner ? "tower" : "house")
      } else {
        put(gx, gy, "tree")
      }
    }
  }

  if (added === 0) return

  persist()
  updateStats()
  requestRender()
  updateGhost()
  syncCars()
}

/* ---------- cars ---------- */

interface CarPalette {
  body: string
  side: string
  glass: string
  roof: string
}

const CAR_PALETTES: CarPalette[] = [
  { body: "#f5c518", side: "#c69c00", glass: "#2f2e2b", roof: "#f7f6f2" },
  { body: "#f0efeb", side: "#cfcec9", glass: "#4e6f7c", roof: "#dfe9ec" },
  { body: "#78a3b5", side: "#5f8b9c", glass: "#253d47", roof: "#e9f1f4" },
]

interface Car {
  id: number
  gx: number
  gy: number
  dx: number
  dy: number
  progress: number
  speed: number
  steps: number
  palette: CarPalette
  group: SVGGElement
}

interface CarDirection {
  dx: number
  dy: number
}

const CAR_DIRECTIONS: CarDirection[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]

const cars: Car[] = []
let nextCarId = 1
let carSyncTimer: number | undefined
let carRefillTimer: number | undefined

function carPrism(base: Point[], height: number, topFill: string, sideFill: string): string {
  const top = base.map(([x, y]): Point => [x, y - height])
  const centerX = base.reduce((sum, p) => sum + p[0], 0) / base.length
  const centerY = base.reduce((sum, p) => sum + p[1], 0) / base.length

  let sides = ""
  for (let i = 0; i < base.length; i++) {
    const p = base[i]
    const q = base[(i + 1) % base.length]
    let nx = q[1] - p[1]
    let ny = -(q[0] - p[0])
    const length = Math.hypot(nx, ny) || 1
    nx /= length
    ny /= length

    const midX = (p[0] + q[0]) / 2
    const midY = (p[1] + q[1]) / 2
    if ((midX - centerX) * nx + (midY - centerY) * ny < 0) {
      nx = -nx
      ny = -ny
    }

    if (ny > 0) {
      sides += `<polygon class="car-side" points="${points([p, q, top[(i + 1) % base.length], top[i]])}" fill="${sideFill}"/>`
    }
  }

  return sides + `<polygon class="car-body" points="${points(top)}" fill="${topFill}"/>`
}

function carMarkup(dx: number, dy: number, palette: CarPalette): string {
  const a: Point = [(dx - dy) * 8, (dx + dy) * 4]
  const b: Point = [-(dx + dy) * 3.2, (dx - dy) * 1.6]

  const base: Point[] = [
    addPoint(scalePoint(a, -1), b),
    addPoint(a, b),
    addPoint(a, scalePoint(b, -1)),
    addPoint(scalePoint(a, -1), scalePoint(b, -1)),
  ]

  const bodyHeight = 3.2
  const cabinHeight = 2.2

  const beam = `<polygon class="car-beam" points="${points([
    addPoint(a, scalePoint(b, 0.9)),
    addPoint(scalePoint(a, 2.7), scalePoint(b, 2)),
    addPoint(scalePoint(a, 2.7), scalePoint(b, -2)),
    addPoint(a, scalePoint(b, -0.9)),
  ])}"/>`

  const shadow = `<polygon points="${points(base)}" transform="translate(0 1.8)" fill="#000000" opacity="0.13"/>`
  const body = carPrism(base, bodyHeight, palette.body, palette.side)

  const cabinCenter = addPoint(scalePoint(a, -0.06), [0, -bodyHeight])
  const cabinHalfLength = scalePoint(a, 0.42)
  const cabinHalfWidth = scalePoint(b, 0.62)
  const cabinBase: Point[] = [
    addPoint(addPoint(cabinCenter, scalePoint(cabinHalfLength, -1)), cabinHalfWidth),
    addPoint(addPoint(cabinCenter, cabinHalfLength), cabinHalfWidth),
    addPoint(addPoint(cabinCenter, cabinHalfLength), scalePoint(cabinHalfWidth, -1)),
    addPoint(addPoint(cabinCenter, scalePoint(cabinHalfLength, -1)), scalePoint(cabinHalfWidth, -1)),
  ]
  const cabin = carPrism(cabinBase, cabinHeight, palette.roof, palette.side)

  const windCenter = addPoint(addPoint(cabinCenter, scalePoint(a, 0.16)), [0, -cabinHeight])
  const windHalfLength = scalePoint(a, 0.15)
  const windHalfWidth = scalePoint(b, 0.48)
  const windshield = `<polygon class="car-glass" points="${points([
    addPoint(addPoint(windCenter, scalePoint(windHalfLength, -1)), windHalfWidth),
    addPoint(addPoint(windCenter, windHalfLength), windHalfWidth),
    addPoint(addPoint(windCenter, windHalfLength), scalePoint(windHalfWidth, -1)),
    addPoint(addPoint(windCenter, scalePoint(windHalfLength, -1)), scalePoint(windHalfWidth, -1)),
  ])}"/>`

  const lampY = -bodyHeight
  const frontLamp = addPoint(scalePoint(a, 0.88), [0, lampY])
  const rearLamp = addPoint(scalePoint(a, -0.88), [0, lampY])
  const headlightLeft = addPoint(frontLamp, scalePoint(b, 0.55))
  const headlightRight = addPoint(frontLamp, scalePoint(b, -0.55))
  const taillightLeft = addPoint(rearLamp, scalePoint(b, 0.55))
  const taillightRight = addPoint(rearLamp, scalePoint(b, -0.55))

  const lights =
    `<circle class="car-headlight" cx="${round(headlightLeft[0])}" cy="${round(headlightLeft[1])}" r="1.15"/>` +
    `<circle class="car-headlight" cx="${round(headlightRight[0])}" cy="${round(headlightRight[1])}" r="1.15"/>` +
    `<circle class="car-taillight" cx="${round(taillightLeft[0])}" cy="${round(taillightLeft[1])}" r="1"/>` +
    `<circle class="car-taillight" cx="${round(taillightRight[0])}" cy="${round(taillightRight[1])}" r="1"/>`

  return beam + shadow + body + cabin + windshield + lights
}

function setCarDirection(car: Car, dx: number, dy: number): void {
  if (car.dx === dx && car.dy === dy) return
  car.dx = dx
  car.dy = dy
  car.group.setAttribute("data-dir", `${dx},${dy}`)
  car.group.innerHTML = carMarkup(dx, dy, car.palette)
}

function setCarPosition(car: Car): void {
  const fromX = isoX(car.gx, car.gy)
  const fromY = isoY(car.gx, car.gy)
  const toX = isoX(car.gx + car.dx, car.gy + car.dy)
  const toY = isoY(car.gx + car.dx, car.gy + car.dy)
  car.group.setAttribute(
    "transform",
    `translate(${fromX + (toX - fromX) * car.progress} ${fromY + (toY - fromY) * car.progress})`,
  )
}

function parseTileKey(key: string): Tile {
  const [gx, gy] = key.split(",").map(Number)
  return { gx, gy }
}

function createCar(tile: Tile, direction: CarDirection): Car {
  const id = nextCarId
  nextCarId += 1

  const palette = CAR_PALETTES[id % CAR_PALETTES.length]
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g")
  group.setAttribute("class", "car")
  group.setAttribute("data-id", String(id))
  group.setAttribute("data-dir", `${direction.dx},${direction.dy}`)
  group.style.opacity = "0"
  carsGroup.appendChild(group)

  const car: Car = {
    id,
    gx: tile.gx,
    gy: tile.gy,
    dx: direction.dx,
    dy: direction.dy,
    progress: 0,
    speed: 1.2 + (id % 3) * 0.18,
    steps: 0,
    palette,
    group,
  }

  group.innerHTML = carMarkup(direction.dx, direction.dy, palette)
  setCarPosition(car)
  cars.push(car)

  requestAnimationFrame(() => {
    if (cars.includes(car)) group.style.opacity = "1"
  })

  return car
}

function removeCar(car: Car): void {
  car.group.remove()
  const index = cars.indexOf(car)
  if (index >= 0) cars.splice(index, 1)
}

function retireCar(car: Car): void {
  const index = cars.indexOf(car)
  if (index < 0) return

  cars.splice(index, 1)
  car.group.style.opacity = "0"
  window.setTimeout(() => car.group.remove(), 280)
  scheduleCarRefill()
}

function scheduleCarRefill(): void {
  if (carRefillTimer !== undefined) return
  carRefillTimer = window.setTimeout(() => {
    carRefillTimer = undefined
    syncCars()
  }, 550)
}

function roadDegree(gx: number, gy: number): number {
  return (
    Number(isRoad(gx + 1, gy)) +
    Number(isRoad(gx - 1, gy)) +
    Number(isRoad(gx, gy + 1)) +
    Number(isRoad(gx, gy - 1))
  )
}

function chooseCarDirection(car: Car): boolean {
  const options = CAR_DIRECTIONS.filter((direction) =>
    isRoad(car.gx + direction.dx, car.gy + direction.dy),
  )
  const nonReverse = options.filter(
    (direction) => !(direction.dx === -car.dx && direction.dy === -car.dy),
  )
  if (nonReverse.length === 0) return false

  // Avoid turning into a cul-de-sac. Retire instead of bouncing at road ends.
  const pool = nonReverse.filter(
    (direction) => roadDegree(car.gx + direction.dx, car.gy + direction.dy) > 1,
  )
  if (pool.length === 0) return false

  const forward = pool.find((direction) => direction.dx === car.dx && direction.dy === car.dy)
  let next = forward

  if (!next || car.steps % 4 === 0) {
    const turns = pool.filter(
      (direction) => direction.dx !== car.dx || direction.dy !== car.dy,
    )
    if (turns.length > 0) {
      next = turns[(car.id + car.steps) % turns.length]
    }
  }

  if (!next) next = pool[0]
  setCarDirection(car, next.dx, next.dy)
  return true
}

function canExit(tile: Tile): boolean {
  return CAR_DIRECTIONS.some(
    (direction) =>
      isRoad(tile.gx + direction.dx, tile.gy + direction.dy) &&
      roadDegree(tile.gx + direction.dx, tile.gy + direction.dy) > 1,
  )
}

function syncCars(): void {
  const candidates: Tile[] = []

  for (const [key, cell] of structures) {
    if (cell !== "road") continue
    const tile = parseTileKey(key)
    if (roadDegree(tile.gx, tile.gy) < 2 || !canExit(tile)) continue
    candidates.push(tile)
  }

  const target =
    candidates.length === 0 ? 0 : clamp(Math.round(candidates.length / 10), 2, 18)

  for (const car of [...cars]) {
    if (!isRoad(car.gx, car.gy)) retireCar(car)
  }
  while (cars.length > target) {
    removeCar(cars[cars.length - 1])
  }
  if (cars.length >= target) return

  candidates.sort((a, b) => hashCell(a.gx, a.gy) - hashCell(b.gx, b.gy))
  const occupied = new Set(cars.map((car) => tileKey(car.gx, car.gy)))

  for (const tile of candidates) {
    if (cars.length >= target) break
    const key = tileKey(tile.gx, tile.gy)
    if (occupied.has(key)) continue

    const tooClose = cars.some(
      (car) => Math.abs(car.gx - tile.gx) <= 1 && Math.abs(car.gy - tile.gy) <= 1,
    )
    if (tooClose) continue

    const directions = CAR_DIRECTIONS.filter(
      (direction) =>
        isRoad(tile.gx + direction.dx, tile.gy + direction.dy) &&
        roadDegree(tile.gx + direction.dx, tile.gy + direction.dy) > 1,
    )
    if (directions.length === 0) continue

    createCar(tile, directions[nextCarId % directions.length])
    occupied.add(key)
  }
}

function updateCars(dt: number): void {
  for (const car of [...cars]) {
    if (!isRoad(car.gx, car.gy)) {
      retireCar(car)
      continue
    }

    if (!isRoad(car.gx + car.dx, car.gy + car.dy)) {
      car.progress = 0
      if (!chooseCarDirection(car) || !isRoad(car.gx + car.dx, car.gy + car.dy)) {
        retireCar(car)
        continue
      }
    }

    car.progress += car.speed * dt

    if (car.progress >= 1) {
      car.gx += car.dx
      car.gy += car.dy
      car.progress -= 1
      car.steps += 1

      if (!isRoad(car.gx, car.gy) || !chooseCarDirection(car)) {
        retireCar(car)
        continue
      }
    }

    setCarPosition(car)
  }
}

function queueCarSync(): void {
  if (carSyncTimer !== undefined) return
  carSyncTimer = window.setTimeout(() => {
    carSyncTimer = undefined
    syncCars()
  }, 350)
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
let carFrame = performance.now()

function animateCars(now: number): void {
  const dt = Math.min((now - carFrame) / 1000, 0.08)
  carFrame = now

  if (!reduceMotion.matches) updateCars(dt)
  requestAnimationFrame(animateCars)
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
  queueCarSync()
}

function eraseTile(tile: Tile): void {
  const key = tileKey(tile.gx, tile.gy)
  if (structures.delete(key)) {
    persist()
    updateStats()
    requestRender()
    updateGhost()
    queueCarSync()
    return
  }
  if (water.delete(key)) {
    persist()
    updateStats()
    requestRender()
    updateGhost()
    queueCarSync()
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
    const lakehouse = tool === "house" && isNearWater(gx, gy)
    content += buildingMarkup(tool, hashCell(gx, gy), lakehouse) + outline
  }

  ghostGroup.setAttribute("transform", `translate(${isoX(gx, gy)} ${isoY(gx, gy)})`)
  ghostGroup.innerHTML = content
}

/* ---------- theme ---------- */

type Theme = "light" | "dark"

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light"
}

function applyTheme(theme: Theme, remember: boolean): void {
  document.documentElement.dataset.theme = theme

  const next = theme === "light" ? "dark" : "light"
  themeToggle.setAttribute("aria-label", `Switch to ${next} theme`)
  themeToggle.title = `Switch to ${next} theme (T)`

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === "light" ? "#e9e9e5" : "#17181b"

  if (remember) {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // The theme still applies for this session.
    }
  }
}

function toggleTheme(): void {
  applyTheme(currentTheme() === "light" ? "dark" : "light", true)
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
  if (!window.confirm("Clear all buildings, roads, and trees? The river stays.")) return

  structures.clear()
  persist()
  updateStats()
  requestRender()
  updateGhost()
  syncCars()
})

generateButton.addEventListener("click", () => {
  autoBuild()
})

themeToggle.addEventListener("click", () => {
  toggleTheme()
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

  if (event.key.toLowerCase() === "g") {
    event.preventDefault()
    autoBuild()
    return
  }

  if (event.key.toLowerCase() === "t") {
    event.preventDefault()
    toggleTheme()
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

applyTheme(currentTheme(), false)

if (!loadSavedCity()) {
  starterCity()
}

updateStats()
selectTool("house")
persist()
syncCars()
requestAnimationFrame(animateCars)

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
