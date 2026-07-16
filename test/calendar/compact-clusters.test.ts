import { describe, expect, it } from 'vitest'

import { compactClusters } from '@/lib/calendar/compact-clusters'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { LaneLayout } from '@/lib/calendar/overlap-lanes'

type AppointmentLayout = LaneLayout<
  CalendarAppointment & {
    top: number
    height: number
    temporalEnd: number
  }
>

function appointment(id: string, start: string): CalendarAppointment {
  return {
    id,
    appointment_date: '2026-07-13',
    start_time: start,
    end_time: '10:30:00',
    duration_minutes: 60,
    status: 'scheduled',
    color: '#6d4bd8',
    title: 'Physio',
    price: 50,
    patient_id: `patient-${id}`,
    service_id: 'service-1',
    locked: false,
    manual_override: false,
    version: 1,
  }
}

function layout(
  id: string,
  lane: number,
  laneCount: number,
  top = 0,
  temporalEnd = 60,
): AppointmentLayout {
  return {
    ...appointment(id, `09:${String(lane * 15).padStart(2, '0')}:00`),
    top,
    height: 60,
    temporalEnd,
    lane,
    laneCount,
    leftPercent: lane * (100 / laneCount),
    widthPercent: 100 / laneCount,
  }
}

describe('compactClusters', () => {
  it('keeps one or two readable lanes as separate appointments', () => {
    const single = [layout('one', 0, 1)]
    const pair = [layout('first', 0, 2), layout('second', 1, 2)]

    expect(compactClusters(single, 120, 40)).toEqual([
      { kind: 'appointment', layout: single[0] },
    ])
    expect(compactClusters(pair, 120, 40).map((item) => item.kind)).toEqual([
      'appointment',
      'appointment',
    ])
  })

  it('compacts three temporally colliding lanes below readable width', () => {
    const layouts = [
      layout('first', 0, 3),
      layout('second', 1, 3, 15, 75),
      layout('third', 2, 3, 30, 90),
    ]

    expect(compactClusters(layouts, 90, 40)).toEqual([{
      kind: 'cluster',
      layouts,
    }])
  })

  it('restores three lanes when wider columns make them readable', () => {
    const layouts = [
      layout('first', 0, 3),
      layout('second', 1, 3, 15, 75),
      layout('third', 2, 3, 30, 90),
    ]

    expect(compactClusters(layouts, 180, 40).map((item) => item.kind)).toEqual([
      'appointment',
      'appointment',
      'appointment',
    ])
  })

  it('keeps independent temporal collision groups in separate clusters', () => {
    const firstCluster = [
      layout('first-a', 0, 3, 0, 60),
      layout('first-b', 1, 3, 10, 70),
      layout('first-c', 2, 3, 20, 80),
    ]
    const secondCluster = [
      layout('second-a', 0, 3, 100, 160),
      layout('second-b', 1, 3, 110, 170),
      layout('second-c', 2, 3, 120, 180),
    ]

    const result = compactClusters(
      [...firstCluster, ...secondCluster],
      90,
      40,
    )

    expect(result).toEqual([
      { kind: 'cluster', layouts: firstCluster },
      { kind: 'cluster', layouts: secondCluster },
    ])
  })
})
