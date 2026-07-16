import type { DateRange, WeekBucket } from './types'

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function utcNoon(date: string): Date {
  const match = DATE_ONLY_PATTERN.exec(date)

  if (!match) {
    throw new RangeError(`Invalid date-only value: ${date}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const result = new Date(0)

  result.setUTCHours(12, 0, 0, 0)
  result.setUTCFullYear(year, month - 1, day)

  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date-only value: ${date}`)
  }

  return result
}

function formatDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function minDate(first: string, second: string): string {
  return first < second ? first : second
}

export function businessToday(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type === 'year' || type === 'month' || type === 'day')
      .map(({ type, value }) => [type, value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

export function addBusinessDays(date: string, amount: number): string {
  const result = utcNoon(date)

  result.setUTCDate(result.getUTCDate() + amount)

  return formatDateOnly(result)
}

export function weekRange(date: string): DateRange {
  const value = utcNoon(date)
  const mondayIndex = (value.getUTCDay() + 6) % 7
  const from = addBusinessDays(date, -mondayIndex)

  return {
    from,
    to: addBusinessDays(from, 6),
  }
}

export function monthRange(date: string): DateRange {
  const value = utcNoon(date)
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth()
  const from = new Date(0)
  const to = new Date(0)

  from.setUTCHours(12, 0, 0, 0)
  from.setUTCFullYear(year, month, 1)
  to.setUTCHours(12, 0, 0, 0)
  to.setUTCFullYear(year, month + 1, 0)

  return {
    from: formatDateOnly(from),
    to: formatDateOnly(to),
  }
}

export function monthWeekBuckets(date: string): WeekBucket[] {
  const month = monthRange(date)
  const buckets: WeekBucket[] = []
  let from = month.from

  while (from <= month.to) {
    const to = minDate(weekRange(from).to, month.to)

    buckets.push({ key: from, from, to })
    from = addBusinessDays(to, 1)
  }

  return buckets
}

export function formatBusinessDate(
  date: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(utcNoon(date))
}
