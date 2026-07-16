import { describe, expect, it } from 'vitest'

import { allocateOverlapLanes } from '@/lib/calendar/overlap-lanes'

describe('allocateOverlapLanes', () => {
  it('keeps boxes that only touch at a boundary at full width', () => {
    expect(
      allocateOverlapLanes([
        { id: 'first', top: 0, height: 44 },
        { id: 'second', top: 44, height: 44 },
      ]),
    ).toEqual([
      {
        id: 'first',
        top: 0,
        height: 44,
        lane: 0,
        laneCount: 1,
        leftPercent: 0,
        widthPercent: 100,
      },
      {
        id: 'second',
        top: 44,
        height: 44,
        lane: 0,
        laneCount: 1,
        leftPercent: 0,
        widthPercent: 100,
      },
    ])
  })

  it('places adjacent 15-minute boxes side by side when their 44px rendered heights overlap', () => {
    expect(
      allocateOverlapLanes([
        { id: '09:00', top: 0, height: 44 },
        { id: '09:15', top: 15, height: 44 },
      ]),
    ).toEqual([
      {
        id: '09:00',
        top: 0,
        height: 44,
        lane: 0,
        laneCount: 2,
        leftPercent: 0,
        widthPercent: 50,
      },
      {
        id: '09:15',
        top: 15,
        height: 44,
        lane: 1,
        laneCount: 2,
        leftPercent: 50,
        widthPercent: 50,
      },
    ])
  })

  it('reuses lanes across a transitive collision cluster', () => {
    expect(
      allocateOverlapLanes([
        { id: 'a', top: 0, height: 30 },
        { id: 'b', top: 20, height: 30 },
        { id: 'c', top: 40, height: 30 },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 'a',
        lane: 0,
        laneCount: 2,
        leftPercent: 0,
        widthPercent: 50,
      }),
      expect.objectContaining({
        id: 'b',
        lane: 1,
        laneCount: 2,
        leftPercent: 50,
        widthPercent: 50,
      }),
      expect.objectContaining({
        id: 'c',
        lane: 0,
        laneCount: 2,
        leftPercent: 0,
        widthPercent: 50,
      }),
    ])
  })

  it('allocates simultaneous boxes deterministically and preserves input order', () => {
    const items = [
      { id: 'stable-first', top: 10, height: 44 },
      { id: 'stable-second', top: 10, height: 44 },
      { id: 'stable-third', top: 10, height: 44 },
    ]

    expect(allocateOverlapLanes(items)).toEqual([
      expect.objectContaining({
        id: 'stable-first',
        lane: 0,
        laneCount: 3,
        leftPercent: 0,
        widthPercent: 100 / 3,
      }),
      expect.objectContaining({
        id: 'stable-second',
        lane: 1,
        laneCount: 3,
        leftPercent: 100 / 3,
        widthPercent: 100 / 3,
      }),
      expect.objectContaining({
        id: 'stable-third',
        lane: 2,
        laneCount: 3,
        leftPercent: (100 / 3) * 2,
        widthPercent: 100 / 3,
      }),
    ])

    expect(allocateOverlapLanes(items)).toEqual(allocateOverlapLanes(items))
  })
})
