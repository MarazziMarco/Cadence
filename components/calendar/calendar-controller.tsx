'use client'

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Info, Plus } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { toast } from 'sonner'

import {
  listAppointments,
  minToTime,
  timeToMin,
  updateAppointment,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import {
  confirmCalendarMutationInteractively,
  getCalendarConfig,
  isCalendarWarningConfirmation,
  type CalendarConfig,
} from '@/lib/api/calendar'
import {
  CALENDAR_DENSITY_STORAGE_KEY,
  CALENDAR_VIEW_STORAGE_KEY,
  calendarReducer,
  parseStoredCalendarDensity,
  parseStoredCalendarView,
  visibleRange,
  type CalendarState,
} from '@/lib/calendar/controller'
import {
  addBusinessDays,
  businessToday,
  formatBusinessDate,
} from '@/lib/calendar/date'
import {
  calendarKeys,
  invalidateCalendarAppointments,
} from '@/lib/calendar/query-keys'
import type {
  CalendarView,
  DateRange,
  MoveIntent,
  ResizeIntent,
} from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace-context'
import { WaitingListClient } from '@/components/waiting-list/waiting-list-client'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AppointmentDialog } from './appointment-dialog'
import {
  DesktopWeekCalendar,
  type CalendarRendererProps,
} from './desktop-week-calendar'
import { MobileDayCalendar } from './mobile-day-calendar'
import { OptimizeDialog } from './optimize-dialog'

type CalendarSection = 'calendar' | 'waiting'
type CalendarChange =
  | { kind: 'move'; request: MoveIntent }
  | { kind: 'resize'; request: ResizeIntent }
const EMPTY_APPOINTMENTS: CalendarAppointment[] = []

type SupportedCalendarView = Extract<CalendarView, 'day' | 'week'>

function isSupportedCalendarView(
  view: CalendarView | null,
): view is SupportedCalendarView {
  return view === 'day' || view === 'week'
}

export function createInitialCalendarState(timezone: string): CalendarState {
  return {
    view: 'week',
    selectedDate: businessToday(timezone),
    density: 60,
    selectedAppointmentId: null,
    createAt: null,
  }
}

function shiftedSelectedDate(
  view: CalendarView,
  range: DateRange,
  direction: -1 | 1,
): string {
  if (view === 'month') {
    return direction === -1
      ? addBusinessDays(range.from, -1)
      : addBusinessDays(range.to, 1)
  }

  const amount = view === 'day' ? 1 : view === 'week' ? 7 : 31
  return addBusinessDays(
    direction === -1 ? range.from : range.to,
    direction * amount,
  )
}

function adjacentRange(
  selectedDate: string,
  view: SupportedCalendarView,
  range: DateRange,
  direction: -1 | 1,
): DateRange {
  return visibleSupportedRange(
    shiftedSelectedDate(view, range, direction),
    view,
  )
}

function visibleSupportedRange(
  selectedDate: string,
  view: SupportedCalendarView,
): DateRange {
  return visibleRange({
    view,
    selectedDate,
    density: 60,
    selectedAppointmentId: null,
    createAt: null,
  })
}

export function useDesktopMediaQuery() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
    }
    media.addEventListener('change', handleChange)
    setIsDesktop(media.matches)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return isDesktop
}

export function CalendarController() {
  const { business } = useWorkspace()
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const businessId = business?.id ?? ''
  const timezone = business?.timezone || 'UTC'
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(
    calendarReducer,
    timezone,
    createInitialCalendarState,
  )
  const [section, setSection] = useState<CalendarSection>('calendar')
  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [preferencesRestored, setPreferencesRestored] = useState(false)
  const isDesktop = useDesktopMediaQuery()
  const supportedView: SupportedCalendarView = isSupportedCalendarView(state.view)
    ? state.view
    : 'week'
  const range = useMemo(
    () => visibleSupportedRange(state.selectedDate, supportedView),
    [state.selectedDate, supportedView],
  )
  const previousRange = useMemo(
    () => adjacentRange(state.selectedDate, supportedView, range, -1),
    [range, state.selectedDate, supportedView],
  )
  const nextRange = useMemo(
    () => adjacentRange(state.selectedDate, supportedView, range, 1),
    [range, state.selectedDate, supportedView],
  )

  const [appointmentsQuery, configQuery] = useQueries({
    queries: [
      {
        queryKey: calendarKeys.range(businessId, range.from, range.to),
        queryFn: () => listAppointments(businessId, range.from, range.to),
        enabled: Boolean(businessId),
        placeholderData: keepPreviousData,
      },
      {
        queryKey: calendarKeys.config(businessId),
        queryFn: () => getCalendarConfig(businessId),
        enabled: Boolean(businessId),
        placeholderData: keepPreviousData,
      },
    ],
  })

  const fallbackConfig = useMemo<CalendarConfig>(() => ({
    timezone,
    slotIntervalMinutes: business?.slot_interval_minutes ?? 15,
    defaultDurationMinutes: business?.default_appointment_duration ?? 30,
    maxDailyAppointments: business?.max_daily_appointments ?? null,
    workingHours: [],
    holidays: [],
  }), [
    business?.default_appointment_duration,
    business?.max_daily_appointments,
    business?.slot_interval_minutes,
    timezone,
  ])
  const appointments = appointmentsQuery.data ?? EMPTY_APPOINTMENTS
  const config = configQuery.data ?? fallbackConfig
  const appointmentById = useMemo(
    () => new Map(
      appointments.map((appointment) => [appointment.id, appointment]),
    ),
    [appointments],
  )
  const selectedAppointment = state.selectedAppointmentId
    ? appointmentById.get(state.selectedAppointmentId) ?? null
    : null
  const rendererView = supportedView

  useEffect(() => {
    const storedView = parseStoredCalendarView(
      localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY),
    )
    const storedDensity = parseStoredCalendarDensity(
      localStorage.getItem(CALENDAR_DENSITY_STORAGE_KEY),
    )
    const desktop = window.matchMedia('(min-width: 1024px)').matches
    if (desktop && isSupportedCalendarView(storedView)) {
      dispatch({ type: 'set-view', view: storedView })
    } else if (!desktop) {
      dispatch({ type: 'set-view', view: 'day' })
    }
    if (storedDensity !== null) {
      dispatch({ type: 'set-density', density: storedDensity })
    }
    setPreferencesRestored(true)
  }, [])

  useEffect(() => {
    if (!preferencesRestored) return
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, supportedView)
  }, [preferencesRestored, supportedView])

  useEffect(() => {
    if (!preferencesRestored) return
    localStorage.setItem(
      CALENDAR_DENSITY_STORAGE_KEY,
      String(state.density),
    )
  }, [preferencesRestored, state.density])

  useEffect(() => {
    if (!businessId) return
    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: calendarKeys.range(
          businessId,
          previousRange.from,
          previousRange.to,
        ),
        queryFn: () => listAppointments(
          businessId,
          previousRange.from,
          previousRange.to,
        ),
      }),
      queryClient.prefetchQuery({
        queryKey: calendarKeys.range(
          businessId,
          nextRange.from,
          nextRange.to,
        ),
        queryFn: () => listAppointments(
          businessId,
          nextRange.from,
          nextRange.to,
        ),
      }),
    ])
  }, [
    businessId,
    nextRange.from,
    nextRange.to,
    previousRange.from,
    previousRange.to,
    queryClient,
  ])

  const finishCalendarChange = useCallback(() => {
    invalidateCalendarAppointments(queryClient, businessId)
  }, [businessId, queryClient])

  const calendarChange = useMutation({
    mutationFn: async (change: CalendarChange) => {
      const appointment = appointmentById.get(change.request.appointmentId)
      if (!appointment) {
        throw new Error('Appointment is no longer available')
      }

      if (change.kind === 'move') {
        const { request } = change
        return updateAppointment(
          businessId,
          appointment.id,
          request.expectedVersion,
          {
            appointment_date: request.date,
            start_time: minToTime(request.startMinute),
            end_time: minToTime(
              request.startMinute + appointment.duration_minutes,
            ),
            duration_minutes: appointment.duration_minutes,
          },
        )
      }

      const { request } = change
      const startMinute = timeToMin(appointment.start_time)
      return updateAppointment(
        businessId,
        appointment.id,
        request.expectedVersion,
        {
          end_time: minToTime(startMinute + request.durationMinutes),
          duration_minutes: request.durationMinutes,
        },
      )
    },
    onSuccess: finishCalendarChange,
    onError: async (error: unknown) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(
          error instanceof Error ? error.message : 'Calendar update failed',
        )
        return
      }

      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (confirmed) finishCalendarChange()
      } catch (retryError) {
        toast.error(
          retryError instanceof Error
            ? retryError.message
            : 'Calendar update failed',
        )
      }
    },
  })
  const mutateCalendarChange = calendarChange.mutate

  const handleSelectDate = useCallback((date: string) => {
    dispatch({ type: 'select-date', date })
  }, [])

  const handleSelectAppointment = useCallback((id: string) => {
    dispatch({ type: 'create-at', value: null })
    dispatch({ type: 'select-appointment', id })
  }, [])

  const handleCreateAt = useCallback((date: string, startMinute: number) => {
    dispatch({ type: 'select-appointment', id: null })
    dispatch({ type: 'create-at', value: { date, startMinute } })
  }, [])

  const handleMove = useCallback((request: MoveIntent) => {
    mutateCalendarChange({ kind: 'move', request })
  }, [mutateCalendarChange])

  const handleResize = useCallback((request: ResizeIntent) => {
    mutateCalendarChange({ kind: 'resize', request })
  }, [mutateCalendarChange])

  const handleOpenOptimizer = useCallback(() => {
    setOptimizeOpen(true)
  }, [])

  const rendererProps = useMemo<CalendarRendererProps>(() => ({
    appointments,
    config,
    selectedDate: state.selectedDate,
    density: state.density,
    onSelectDate: handleSelectDate,
    onSelectAppointment: handleSelectAppointment,
    onCreateAt: handleCreateAt,
    onMove: handleMove,
    onResize: handleResize,
  }), [
    appointments,
    config,
    handleCreateAt,
    handleMove,
    handleResize,
    handleSelectAppointment,
    handleSelectDate,
    state.density,
    state.selectedDate,
  ])

  const dialogOpen = Boolean(state.createAt || state.selectedAppointmentId)
  const navigate = useCallback((direction: -1 | 1) => {
    const amount = rendererView === 'day' ? 1 : 7
    dispatch({
      type: 'select-date',
      date: addBusinessDays(state.selectedDate, direction * amount),
    })
  }, [rendererView, state.selectedDate])

  const openNew = useCallback(() => {
    handleCreateAt(state.selectedDate, 9 * 60)
  }, [handleCreateAt, state.selectedDate])

  const closeAppointmentDialog = useCallback((open: boolean) => {
    if (open) return
    dispatch({ type: 'select-appointment', id: null })
    dispatch({ type: 'create-at', value: null })
    invalidateCalendarAppointments(queryClient, businessId)
  }, [businessId, queryClient])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (section !== 'calendar') return
      const target = event.target
      if (
        dialogOpen
        || (
          target instanceof Element
          && target.matches(
            'input, textarea, select, [contenteditable="true"]',
          )
        )
      ) return

      if (event.key === 'n') {
        event.preventDefault()
        openNew()
      } else if (event.key === 'w') {
        dispatch({ type: 'set-view', view: 'week' })
      } else if (event.key === 'd') {
        dispatch({ type: 'set-view', view: 'day' })
      } else if (event.key === 'ArrowLeft') {
        navigate(-1)
      } else if (event.key === 'ArrowRight') {
        navigate(1)
      } else if (event.key === 't') {
        dispatch({ type: 'select-date', date: businessToday(timezone) })
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [dialogOpen, navigate, openNew, section, timezone])

  const label = rendererView === 'day'
    ? formatBusinessDate(state.selectedDate, dateLocale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : `${formatBusinessDate(range.from, dateLocale, {
        month: 'short',
        day: 'numeric',
      })} – ${formatBusinessDate(range.to, dateLocale, {
        month: 'short',
        day: 'numeric',
      })}`
  const keyboardClass = (
    'rounded border border-border bg-muted px-1 text-[11px] font-medium text-foreground'
  )

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setSection('calendar')}
          className={cn(
            'tracking-tight transition-colors',
            section === 'calendar'
              ? 'text-2xl font-bold'
              : 'text-sm font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {t('cal.tab')}
        </button>
        <button
          onClick={() => setSection('waiting')}
          className={cn(
            'tracking-tight transition-colors',
            section === 'waiting'
              ? 'text-2xl font-bold'
              : 'text-sm font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {t('cal.tabWaiting')}
        </button>
        {section === 'calendar' ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                aria-label={t('cal.shortcutsAria')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <p className="text-sm">{t('cal.wlInfo')}</p>
              <div className="mt-3 hidden border-t border-border pt-3 sm:block">
                <p className="mb-2 text-sm font-semibold">
                  {t('cal.shortcuts')}
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><kbd className={keyboardClass}>n</kbd> {t('cal.sc.new')}</li>
                  <li>
                    <kbd className={keyboardClass}>w</kbd> /{' '}
                    <kbd className={keyboardClass}>d</kbd>{' '}
                    {t('cal.sc.weekDay')}
                  </li>
                  <li>
                    <kbd className={keyboardClass}>←</kbd>{' '}
                    <kbd className={keyboardClass}>→</kbd>{' '}
                    {t('cal.sc.prevNext')}
                  </li>
                  <li><kbd className={keyboardClass}>t</kbd> {t('cal.sc.today')}</li>
                </ul>
              </div>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                {t('cal.dragTip')}
              </p>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {section === 'waiting' ? (
        <WaitingListClient hideHeader />
      ) : (
        <>
          {isDesktop ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                <Button size="lg" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> {t('cal.new')}
                </Button>
                {businessId ? (
                  <OptimizeDialog
                    businessId={businessId}
                    dateFrom={range.from}
                    dateTo={range.to}
                    open={optimizeOpen}
                    onOpenChange={setOptimizeOpen}
                  />
                ) : null}
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => navigate(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dispatch({
                      type: 'select-date',
                      date: businessToday(timezone),
                    })}
                  >
                    {t('cal.today')}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => navigate(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="ml-1 text-sm font-semibold">{label}</span>
                </div>
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(['day', 'week'] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => dispatch({ type: 'set-view', view })}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        rendererView === view
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`cal.view.${view}`)}
                    </button>
                  ))}
                </div>
              </div>

              <DesktopWeekCalendar {...rendererProps} view={rendererView} />
            </>
          ) : (
            <>
              <MobileDayCalendar
                {...rendererProps}
                isLoading={appointmentsQuery.isPending || configQuery.isPending}
                onOptimize={businessId ? handleOpenOptimizer : undefined}
              />
              {businessId ? (
                <div className="hidden">
                  <OptimizeDialog
                    businessId={businessId}
                    dateFrom={state.selectedDate}
                    dateTo={state.selectedDate}
                    open={optimizeOpen}
                    onOpenChange={setOptimizeOpen}
                  />
                </div>
              ) : null}
            </>
          )}

          {businessId ? (
            <AppointmentDialog
              businessId={businessId}
              appt={selectedAppointment}
              defaultDate={state.createAt?.date}
              defaultStart={
                state.createAt
                  ? minToTime(state.createAt.startMinute).slice(0, 5)
                  : undefined
              }
              open={dialogOpen}
              onOpenChange={closeAppointmentDialog}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
