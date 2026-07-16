export const MIN_DENSITY = 36
export const DEFAULT_DENSITY = 60
export const MAX_DENSITY = 120

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
}

function requirePositive(value: number, name: string): void {
  requireFinite(value, name)

  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`)
  }
}

function requireFiniteResult(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Calendar geometry result is outside the finite range')
  }

  return value
}

export function clampDensity(value: number): number {
  requireFinite(value, 'Density')

  return Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, value))
}

export function snapMinutes(value: number, interval: number): number {
  requireFinite(value, 'Minutes')
  requirePositive(interval, 'Snap interval')

  return requireFiniteResult(Math.round(value / interval) * interval)
}

export function minutesToY(
  minutes: number,
  startMinute: number,
  density: number,
): number {
  requireFinite(minutes, 'Minutes')
  requireFinite(startMinute, 'Start minute')
  requirePositive(density, 'Density')

  return requireFiniteResult(((minutes - startMinute) / 60) * density)
}

export function yToMinutes(
  y: number,
  startMinute: number,
  density: number,
  interval: number,
): number {
  requireFinite(y, 'Y coordinate')
  requireFinite(startMinute, 'Start minute')
  requirePositive(density, 'Density')
  requirePositive(interval, 'Snap interval')

  const minutes = requireFiniteResult(startMinute + (y / density) * 60)

  return snapMinutes(minutes, interval)
}

export function zoomAroundFocalPoint(input: {
  oldDensity: number
  newDensity: number
  scrollTop: number
  focalY: number
}): { density: number; scrollTop: number } {
  requirePositive(input.oldDensity, 'Old density')
  requireFinite(input.scrollTop, 'Scroll position')
  requireFinite(input.focalY, 'Focal Y coordinate')

  const density = clampDensity(input.newDensity)
  const contentY = requireFiniteResult(input.scrollTop + input.focalY)
  const densityRatio = requireFiniteResult(density / input.oldDensity)
  const scaledContentY = requireFiniteResult(contentY * densityRatio)
  const scrollTop = requireFiniteResult(scaledContentY - input.focalY)

  return { density, scrollTop: Math.max(0, scrollTop) }
}
