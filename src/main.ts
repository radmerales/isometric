import "./style.css"

const SIZE = 12
const HALF_W = 32
const HALF_H = 16
const STORAGE_KEY = "isocity:city:v1"

type Building = "road" | "house" | "tower" | "tree"
type Tool = Building | "erase"
type Cell = Building | null
type Point = [number, number]

const POPULATION: Record<Building, number> = {
  road: 0,
  house: 4,
  tower: 30,
  tree: 0,
}

const ICON_COLOR = "#3f3e3e"
const ACCENT = "#f5c518"
const ACCENT_DARK = "#d6a900"
const ROAD = "#b4b2ad"

/* ---------- helpers ---------- */

function element<T extends Element>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing #${id}`)
  return found as unknown as T
}

const round = (value: number): number => Math.round(value * 100) / 100

const points = (list: Point[]): string =>
  list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")

const polygon = (list: Point[], fill: string): string =>
  `<polygon points="${points(list)}" fill="${fill}"/>`

const gxOf = (index: number): number => index % SIZE
const gyOf = (index: number): number => Math.floor(index / SIZE)
const indexOf = (gx: number, gy: number): number => gy * SIZE + gx

const isBuilding = (value: unknown): value is Building =>
  value === "road" || value === "house" || value === "tower" || value === "tree"

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

/** An isometric box: two visible side faces and a top face. */
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

/** A quad painted onto one of the visible faces of a building. */
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
  const door = faceQuad(frontTop, rightU, rightV, 0.55, 0.78, 0.3, 1, ICON_COLOR)

  const leftU: Point = [-rx, -ry]
  const window = faceQuad(frontTop, leftU, rightV, 0.34, 0.52, 0.26, 0.5, ICON_COLOR)

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
      windows += faceQuad(frontTop, rightU, down, u1, u2, v1, v2, ICON_COLOR)
    }
  }
  for (const [v1, v2] of rows) {
    windows += faceQuad(frontTop, leftU, down, 0.34, 0.5, v1, v2, ICON_COLOR)
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

function buildingMarkup(cell: Building, gx: number, gy: number, index: number): string {
  const seed = gx * 7 + gy * 13 + index
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

/* ---------- roads ---------- */

const isRoad = (gx: number, gy: number): boolean => {
  if (gx < 0 || gx >= SIZE || gy < 0 || gy >= SIZE) return false
  return cells[indexOf(gx, gy)] === "road"
}

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

/* ---------- tiles ---------- */

function tileMarkup(index: number): string {
  const gx = gxOf(index)
  const gy = gyOf(index)
  const cell = cells[index]
  const groundFill = (gx + gy) % 2 === 0 ? "#e6e5e1" : "#e2e1dd"

  const ground = polygon(
    [
      [0, -16],
      [32, 0],
      [0, 16],
      [-32, 0],
    ],
    cell === "road" ? ROAD : groundFill,
  ).replace("<polygon", '<polygon class="tile-top"')

  const hoverRing = `<polygon class="hover-ring" points="0,-13.5 27,0 0,13.5 -27,0"/>`

  let detail = ""
  if (cell === "road") {
    detail = roadMarkup(gx, gy)
  } else if (cell) {
    detail = buildingMarkup(cell, gx, gy, index)
  }

  const x = (gx - gy) * HALF_W
  const y = (gx + gy) * HALF_H

  return `<g class="tile" data-i="${index}" transform="translate(${x} ${y})">${ground}${hoverRing}${detail}</g>`
}

function renderTiles(): void {
  const groups: string[] = []

  // Painter's order: back rows first, so front blocks cover rear ones.
  for (let depth = 0; depth <= 2 * (SIZE - 1); depth++) {
    for (let gx = 0; gx < SIZE; gx++) {
      const gy = depth - gx
      if (gy < 0 || gy >= SIZE) continue
      groups.push(tileMarkup(indexOf(gx, gy)))
    }
  }

  tilesGroup.innerHTML = groups.join("")
}

function renderBoard(): void {
  const last = SIZE - 1
  const right = last * HALF_W + HALF_W
  const bottom = last * HALF_H * 2 + HALF_H
  const mid = last * HALF_H

  const shape: Point[] = [
    [0, -HALF_H],
    [right, mid],
    [0, bottom],
    [-right, mid],
  ]

  boardGroup.innerHTML =
    `<polygon points="${points(shape)}" transform="translate(0 12)" ` +
    `fill="#d6d5d1" stroke="#c1c0bc" stroke-width="1"/>`
}

/* ---------- state ---------- */

function starterCity(): Cell[] {
  const city: Cell[] = Array<Cell>(SIZE * SIZE).fill(null)
  const put = (gx: number, gy: number, cell: Cell): void => {
    city[indexOf(gx, gy)] = cell
  }

  for (let i = 0; i < SIZE; i++) {
    put(5, i, "road")
    put(i, 5, "road")
  }

  put(3, 3, "tower")
  put(8, 8, "tower")

  put(4, 4, "house")
  put(6, 4, "house")
  put(4, 6, "house")
  put(6, 7, "house")

  put(2, 2, "tree")
  put(9, 3, "tree")
  put(3, 9, "tree")
  put(7, 9, "tree")
  put(8, 10, "tree")

  return city
}

function loadCity(): Cell[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== SIZE * SIZE) return null

    return parsed.map((value) => (isBuilding(value) ? value : null))
  } catch {
    return null
  }
}

function saveCity(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells))
    saveStatus.classList.remove("error")
    saveLabel.textContent = "saved"
  } catch {
    saveStatus.classList.add("error")
    saveLabel.textContent = "not saved"
  }
}

/* ---------- dom ---------- */

const svg = element<SVGSVGElement>("city")
const boardGroup = element<SVGGElement>("board")
const tilesGroup = element<SVGGElement>("tiles")
const ghostGroup = element<SVGGElement>("ghost")
const tileCount = element<HTMLElement>("tile-count")
const popCount = element<HTMLElement>("pop-count")
const clearButton = element<HTMLButtonElement>("clear")
const saveStatus = element<HTMLElement>("save-status")
const saveLabel = element<HTMLElement>("save-label")
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tool"))

const stored = loadCity()
let cells: Cell[] = stored ?? starterCity()
let tool: Tool = "house"
let hoverIndex: number | null = null
let painting = false
let lastPainted: number | null = null

/* ---------- ui ---------- */

function updateStats(): void {
  let tiles = 0
  let people = 0

  for (const cell of cells) {
    if (!cell) continue
    tiles += 1
    people += POPULATION[cell]
  }

  tileCount.textContent = String(tiles).padStart(2, "0")
  popCount.textContent = String(people).padStart(3, "0")
}

function selectTool(next: Tool): void {
  tool = next
  for (const button of toolButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === next))
  }
  svg.classList.toggle("is-erase", next === "erase")
  renderGhost()
}

function wouldChange(index: number): boolean {
  const cell = cells[index]
  return tool === "erase" ? cell !== null : cell !== tool
}

function renderGhost(): void {
  if (hoverIndex === null || !wouldChange(hoverIndex)) {
    ghostGroup.innerHTML = ""
    return
  }

  const gx = gxOf(hoverIndex)
  const gy = gyOf(hoverIndex)
  const pad = `<polygon class="ghost-pad" points="0,-14 28,0 0,14 -28,0"/>`

  let content = pad
  if (tool === "erase") {
    content += `<path class="ghost-x" d="M-8,-4 L8,4 M8,-4 L-8,4"/>`
  } else if (tool === "road") {
    content += polygon(
      [
        [0, -16],
        [32, 0],
        [0, 16],
        [-32, 0],
      ],
      ROAD,
    )
    content += roadMarkup(gx, gy)
  } else {
    content += buildingMarkup(tool, gx, gy, hoverIndex)
  }

  ghostGroup.setAttribute("transform", `translate(${(gx - gy) * HALF_W} ${(gx + gy) * HALF_H})`)
  ghostGroup.innerHTML = content
}

function setHover(next: number | null): void {
  if (next === hoverIndex) return
  hoverIndex = next
  renderGhost()
}

function place(index: number): void {
  const next: Cell = tool === "erase" ? null : tool
  if (cells[index] === next) return

  cells[index] = next
  saveCity()
  renderTiles()
  updateStats()
  renderGhost()
}

function clearTile(index: number): void {
  if (cells[index] === null) return
  cells[index] = null
  saveCity()
  renderTiles()
  updateStats()
  renderGhost()
}

/* ---------- pointer input ---------- */

function tileFromPoint(clientX: number, clientY: number): number | null {
  const hit = document.elementFromPoint(clientX, clientY)
  if (!(hit instanceof Element)) return null
  const tile = hit.closest<SVGGElement>("g.tile")
  if (!tile) return null
  const index = Number(tile.dataset.i)
  return Number.isInteger(index) ? index : null
}

svg.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return
  const index = tileFromPoint(event.clientX, event.clientY)
  if (index === null) return

  event.preventDefault()
  painting = true
  lastPainted = index
  place(index)
  setHover(event.pointerType === "mouse" ? index : null)
})

svg.addEventListener("pointermove", (event) => {
  const index = tileFromPoint(event.clientX, event.clientY)

  if (painting) {
    if (index !== null && index !== lastPainted) {
      lastPainted = index
      place(index)
      if (event.pointerType === "mouse") setHover(index)
    }
    return
  }

  if (event.pointerType === "mouse") setHover(index)
})

svg.addEventListener("pointerleave", () => {
  setHover(null)
})

window.addEventListener("pointerup", () => {
  painting = false
  lastPainted = null
})

window.addEventListener("pointercancel", () => {
  painting = false
  lastPainted = null
})

svg.addEventListener("contextmenu", (event) => {
  event.preventDefault()
  const index = tileFromPoint(event.clientX, event.clientY)
  if (index !== null) clearTile(index)
})

/* ---------- toolbar ---------- */

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    const value = button.dataset.tool
    if (value === "road" || value === "house" || value === "tower" || value === "tree" || value === "erase") {
      selectTool(value)
    }
  })
}

const KEY_TOOLS: Record<string, Tool> = {
  "1": "road",
  "2": "house",
  "3": "tower",
  "4": "tree",
  "5": "erase",
  x: "erase",
  e: "erase",
}

window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const next = KEY_TOOLS[event.key.toLowerCase()]
  if (!next) return
  event.preventDefault()
  selectTool(next)
})

clearButton.addEventListener("click", () => {
  if (!cells.some(Boolean)) return
  if (!window.confirm("Clear the whole city?")) return

  cells = Array<Cell>(SIZE * SIZE).fill(null)
  saveCity()
  renderTiles()
  updateStats()
  renderGhost()
})

/* ---------- boot ---------- */

renderBoard()
renderTiles()
updateStats()
selectTool("house")
saveCity()
