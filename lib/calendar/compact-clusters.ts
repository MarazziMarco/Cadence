import type { CalendarAppointment } from '@/lib/api/appointments'
import type { LaneLayout } from '@/lib/calendar/overlap-lanes'

export type CompactAppointmentLayout = LaneLayout<
  CalendarAppointment & {
    top: number
    height: number
    temporalEnd: number
  }
>

export type CompactClusterItem =
  | { kind: 'appointment'; layout: CompactAppointmentLayout }
  | { kind: 'cluster'; layouts: CompactAppointmentLayout[] }

interface IndexedLayout {
  layout: CompactAppointmentLayout
  index: number
}

export function compactClusters(
  layouts: CompactAppointmentLayout[],
  availableWidth: number,
  minimumReadableWidth: number,
): CompactClusterItem[] {
  const sorted = layouts
    .map((layout, index): IndexedLayout => ({ layout, index }))
    .sort((left, right) => (
      left.layout.top - right.layout.top || left.index - right.index
    ))
  const result: CompactClusterItem[] = []

  for (let start = 0; start < sorted.length; ) {
    let end = start + 1
    let temporalEnd = sorted[start].layout.temporalEnd

    while (
      end < sorted.length
      && sorted[end].layout.top < temporalEnd
    ) {
      temporalEnd = Math.max(temporalEnd, sorted[end].layout.temporalEnd)
      end += 1
    }

    const cluster = sorted.slice(start, end).map(({ layout }) => layout)
    const narrowestWidth = Math.min(...cluster.map((layout) => (
      availableWidth * layout.widthPercent / 100
    )))
    if (cluster.length > 1 && narrowestWidth < minimumReadableWidth) {
      result.push({ kind: 'cluster', layouts: cluster })
    } else {
      result.push(...cluster.map((layout) => ({
        kind: 'appointment' as const,
        layout,
      })))
    }
    start = end
  }

  return result
}
