import { describe, expect, it } from 'vitest'

import {
  clampDensity,
  minutesToY,
  snapMinutes,
  yToMinutes,
  zoomAroundFocalPoint,
} from '@/lib/calendar/geometry'

describe('calendar geometry', () => {
  it('clamps density to 36-120 px per hour', () => {
    expect(clampDensity(20)).toBe(36)
    expect(clampDensity(60)).toBe(60)
    expect(clampDensity(150)).toBe(120)
  })

  it('snaps to the configured interval using nearest-interval rounding', () => {
    expect(snapMinutes(548, 15)).toBe(555)
    expect(snapMinutes(548, 10)).toBe(550)
    expect(snapMinutes(7.5, 15)).toBe(15)
  })

  it('round-trips between minutes and y coordinates at snapped times', () => {
    const y = minutesToY(555, 480, 72)

    expect(y).toBe(90)
    expect(yToMinutes(y, 480, 72, 15)).toBe(555)
  })

  it('keeps focal time fixed while zooming', () => {
    expect(
      zoomAroundFocalPoint({
        oldDensity: 60,
        newDensity: 90,
        scrollTop: 300,
        focalY: 200,
      }),
    ).toEqual({ density: 90, scrollTop: 550 })
  })

  it('uses the clamped density when calculating zoom scroll position', () => {
    expect(
      zoomAroundFocalPoint({
        oldDensity: 60,
        newDensity: 200,
        scrollTop: 300,
        focalY: 200,
      }),
    ).toEqual({ density: 120, scrollTop: 800 })

    expect(
      zoomAroundFocalPoint({
        oldDensity: 60,
        newDensity: 20,
        scrollTop: 300,
        focalY: 200,
      }),
    ).toEqual({ density: 36, scrollTop: 100 })
  })

  it('never returns a negative scroll position when zooming out', () => {
    expect(
      zoomAroundFocalPoint({
        oldDensity: 120,
        newDensity: 36,
        scrollTop: 0,
        focalY: 200,
      }),
    ).toEqual({ density: 36, scrollTop: 0 })
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite numeric inputs: %s',
    (value) => {
      expect(() => clampDensity(value)).toThrow(RangeError)
      expect(() => snapMinutes(value, 15)).toThrow(RangeError)
      expect(() => snapMinutes(555, value)).toThrow(RangeError)
      expect(() => minutesToY(value, 480, 60)).toThrow(RangeError)
      expect(() => minutesToY(555, value, 60)).toThrow(RangeError)
      expect(() => minutesToY(555, 480, value)).toThrow(RangeError)
      expect(() => yToMinutes(value, 480, 60, 15)).toThrow(RangeError)
      expect(() => yToMinutes(90, value, 60, 15)).toThrow(RangeError)
      expect(() => yToMinutes(90, 480, value, 15)).toThrow(RangeError)
      expect(() => yToMinutes(90, 480, 60, value)).toThrow(RangeError)
      expect(() =>
        zoomAroundFocalPoint({
          oldDensity: value,
          newDensity: 90,
          scrollTop: 300,
          focalY: 200,
        }),
      ).toThrow(RangeError)
      expect(() =>
        zoomAroundFocalPoint({
          oldDensity: 60,
          newDensity: value,
          scrollTop: 300,
          focalY: 200,
        }),
      ).toThrow(RangeError)
      expect(() =>
        zoomAroundFocalPoint({
          oldDensity: 60,
          newDensity: 90,
          scrollTop: value,
          focalY: 200,
        }),
      ).toThrow(RangeError)
      expect(() =>
        zoomAroundFocalPoint({
          oldDensity: 60,
          newDensity: 90,
          scrollTop: 300,
          focalY: value,
        }),
      ).toThrow(RangeError)
    },
  )

  it.each([0, -1])('rejects non-positive snap intervals: %s', (interval) => {
    expect(() => snapMinutes(555, interval)).toThrow(RangeError)
    expect(() => yToMinutes(90, 480, 60, interval)).toThrow(RangeError)
  })

  it.each([0, -1])(
    'rejects non-positive densities used for coordinate conversion: %s',
    (density) => {
      expect(() => minutesToY(555, 480, density)).toThrow(RangeError)
      expect(() => yToMinutes(90, 480, density, 15)).toThrow(RangeError)
      expect(() =>
        zoomAroundFocalPoint({
          oldDensity: density,
          newDensity: 90,
          scrollTop: 300,
          focalY: 200,
        }),
      ).toThrow(RangeError)
    },
  )

  it('clamps non-positive requested densities instead of using them in zoom math', () => {
    expect(clampDensity(0)).toBe(36)
    expect(clampDensity(-10)).toBe(36)
    expect(
      zoomAroundFocalPoint({
        oldDensity: 60,
        newDensity: 0,
        scrollTop: 300,
        focalY: 200,
      }),
    ).toEqual({ density: 36, scrollTop: 100 })
  })

  it('rejects finite inputs when arithmetic would overflow', () => {
    expect(() =>
      minutesToY(Number.MAX_VALUE, -Number.MAX_VALUE, 120),
    ).toThrow(RangeError)
    expect(() =>
      yToMinutes(Number.MAX_VALUE, 0, Number.MIN_VALUE, 15),
    ).toThrow(RangeError)
    expect(() => snapMinutes(Number.MAX_VALUE, Number.MIN_VALUE)).toThrow(
      RangeError,
    )
    expect(() =>
      zoomAroundFocalPoint({
        oldDensity: Number.MIN_VALUE,
        newDensity: 120,
        scrollTop: Number.MAX_VALUE,
        focalY: 0,
      }),
    ).toThrow(RangeError)
  })
})
