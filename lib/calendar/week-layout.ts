export type PhoneWeekLayout = 'grid' | 'timeline'

export const PHONE_WEEK_LAYOUT_STORAGE_KEY =
  'cadence.calendar.phoneWeekLayout'

export function parsePhoneWeekLayout(value: unknown): PhoneWeekLayout {
  return value === 'timeline' ? 'timeline' : 'grid'
}

export function clampVisibleWeekDays(value: number) {
  if (!Number.isFinite(value)) return 7
  return Math.min(7, Math.max(3, value))
}

export function weekColumnWidth(
  containerWidth: number,
  visibleDays: number,
) {
  return containerWidth / clampVisibleWeekDays(visibleDays)
}

export function selectedDayScrollLeft({
  containerWidth,
  columnWidth,
  selectedIndex,
  dayCount,
}: {
  containerWidth: number
  columnWidth: number
  selectedIndex: number
  dayCount: number
}) {
  const contentWidth = columnWidth * dayCount
  const centered = (
    selectedIndex * columnWidth
    + columnWidth / 2
    - containerWidth / 2
  )
  return Math.min(
    Math.max(0, contentWidth - containerWidth),
    Math.max(0, centered),
  )
}
