import { expect, type Locator, type Page } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface CanvasFrame {
  readonly image: PNG
}

export async function captureCanvas(canvas: Locator): Promise<CanvasFrame> {
  const bytes = await canvas.screenshot()
  return { image: PNG.sync.read(bytes) }
}

function dominantColor(image: PNG): readonly [number, number, number] {
  const buckets = new Map<number, number>()

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const key =
      (((image.data[offset] ?? 0) >> 4) << 8) |
      (((image.data[offset + 1] ?? 0) >> 4) << 4) |
      ((image.data[offset + 2] ?? 0) >> 4)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  const [key = 0] = [...buckets.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0] ?? []

  return [
    ((key >> 8) & 0xf) * 16 + 8,
    ((key >> 4) & 0xf) * 16 + 8,
    (key & 0xf) * 16 + 8,
  ]
}

export function nonBackgroundRatio(image: PNG): number {
  const background = dominantColor(image)
  let changed = 0

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = (image.data[offset] ?? 0) - background[0]
    const green = (image.data[offset + 1] ?? 0) - background[1]
    const blue = (image.data[offset + 2] ?? 0) - background[2]

    if (Math.sqrt(red * red + green * green + blue * blue) > 24) {
      changed += 1
    }
  }

  return changed / (image.width * image.height)
}

export function centerBrightnessVariance(image: PNG): number {
  const startX = Math.floor(image.width * 0.25)
  const endX = Math.ceil(image.width * 0.75)
  const startY = Math.floor(image.height * 0.25)
  const endY = Math.ceil(image.height * 0.75)
  let count = 0
  let sum = 0
  let sumSquares = 0

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * image.width + x) * 4
      const brightness =
        (image.data[offset] ?? 0) * 0.2126 +
        (image.data[offset + 1] ?? 0) * 0.7152 +
        (image.data[offset + 2] ?? 0) * 0.0722
      count += 1
      sum += brightness
      sumSquares += brightness * brightness
    }
  }

  if (!count) return 0
  const mean = sum / count
  return sumSquares / count - mean * mean
}

export function canvasChangeRatio(
  before: CanvasFrame,
  after: CanvasFrame,
): number {
  expect(after.image.width).toBe(before.image.width)
  expect(after.image.height).toBe(before.image.height)

  const changed = pixelmatch(
    before.image.data,
    after.image.data,
    undefined,
    before.image.width,
    before.image.height,
    { includeAA: true, threshold: 0.08 },
  )

  return changed / (before.image.width * before.image.height)
}

export async function expectCanvasComposition(
  page: Page,
  canvas: Locator,
): Promise<CanvasFrame> {
  const viewport = page.viewportSize()
  const bounds = await canvas.boundingBox()

  expect(viewport).not.toBeNull()
  expect(bounds).not.toBeNull()

  const visibleWidth = Math.max(
    0,
    Math.min(bounds!.x + bounds!.width, viewport!.width) - Math.max(bounds!.x, 0),
  )
  const visibleHeight = Math.max(
    0,
    Math.min(bounds!.y + bounds!.height, viewport!.height) - Math.max(bounds!.y, 0),
  )
  const viewportCoverage =
    (visibleWidth * visibleHeight) / (viewport!.width * viewport!.height)

  expect(viewportCoverage).toBeGreaterThanOrEqual(0.95)

  const frame = await captureCanvas(canvas)
  expect(nonBackgroundRatio(frame.image)).toBeGreaterThan(0.01)
  expect(centerBrightnessVariance(frame.image)).toBeGreaterThan(2)
  return frame
}
