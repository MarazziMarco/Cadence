import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CalendarToolbar } from '@/components/calendar/calendar-toolbar'
import type { CalendarView } from '@/lib/calendar/types'

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({
    locale: 'en',
    t: (key: string) => ({
      'cal.today': 'Today',
      'cal.viewMenu': 'Calendar view',
      'cal.view.day': 'Day',
      'cal.view.week': 'Week',
      'cal.view.month': 'Month',
      'cal.view.agenda': 'Agenda',
      'common.previous': 'Previous',
      'common.next': 'Next',
    })[key] ?? key,
  }),
}))

function renderToolbar(view: CalendarView, onNavigate = vi.fn()) {
  render(
    <CalendarToolbar
      selectedDate="2026-07-16"
      view={view}
      enabledViews={['day', 'week', 'month', 'agenda']}
      onToday={() => {}}
      onViewChange={() => {}}
      onNavigate={onNavigate}
    />,
  )
  return onNavigate
}

describe('CalendarToolbar mobile range navigation', () => {
  it.each([
    ['day', 'Thursday, July 16'],
    ['week', 'Jul 13 – Jul 19, 2026'],
    ['month', 'July 2026'],
  ] as const)('shows a contextual %s label', (view, label) => {
    renderToolbar(view)

    expect(screen.getByTestId('calendar-range-label')).toHaveTextContent(label)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })

  it('uses visible 44px previous and next buttons', () => {
    const onNavigate = renderToolbar('week')

    const previous = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(previous).toHaveClass('h-11', 'w-11')
    expect(next).toHaveClass('h-11', 'w-11')

    fireEvent.click(previous)
    fireEvent.click(next)
    expect(onNavigate.mock.calls).toEqual([[-1], [1]])
  })

  it('maps horizontal header swipes to the same navigation callback', () => {
    const onNavigate = renderToolbar('month')
    const label = screen.getByTestId('calendar-range-label')

    fireEvent.touchStart(label, {
      touches: [{ clientX: 260, clientY: 100 }],
    })
    fireEvent.touchEnd(label, {
      changedTouches: [{ clientX: 80, clientY: 104 }],
    })
    fireEvent.touchStart(label, {
      touches: [{ clientX: 80, clientY: 100 }],
    })
    fireEvent.touchEnd(label, {
      changedTouches: [{ clientX: 260, clientY: 104 }],
    })

    expect(onNavigate.mock.calls).toEqual([[1], [-1]])
  })

  it('ignores short and primarily vertical swipes', () => {
    const onNavigate = renderToolbar('day')
    const label = screen.getByTestId('calendar-range-label')

    fireEvent.touchStart(label, {
      touches: [{ clientX: 100, clientY: 100 }],
    })
    fireEvent.touchEnd(label, {
      changedTouches: [{ clientX: 140, clientY: 102 }],
    })
    fireEvent.touchStart(label, {
      touches: [{ clientX: 100, clientY: 100 }],
    })
    fireEvent.touchEnd(label, {
      changedTouches: [{ clientX: 165, clientY: 220 }],
    })

    expect(onNavigate).not.toHaveBeenCalled()
  })
})
