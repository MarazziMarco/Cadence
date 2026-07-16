'use client'

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Info, Plus, Wand2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import {
  deleteAppointment,
  listAppointments,
  minToTime,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import {
  calendarChangeRequest,
  confirmCalendarMutationInteractively,
  getCalendarConfig,
  isCalendarWarningConfirmation,
  mutateCalendarOrThrow,
  optimisticCalendarAppointment,
  undoCalendarChangeRequest,
  type CalendarAppointmentChange,
  type CalendarConfig,
} from '@/lib/api/calendar'
import {
  CALENDAR_DENSITY_STORAGE_KEY,
  CALENDAR_VIEW_STORAGE_KEY,
  calendarReducer,
  parseStoredCalendarDensity,
  parseStoredCalendarView,
  visibleRange,
  responsiveCalendarLayout,
  type ResponsiveCalendarLayout,
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
  invalidateLegacyAppointments,
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
import {
  AppointmentDialog,
  type AppointmentEditorPresentation,
} from './appointment-dialog'
import { AppointmentQuickSheet } from './appointment-quick-sheet'
import { CalendarAgenda } from './calendar-agenda'
import { ContextualOptimizeDialog } from './contextual-optimize-dialog'
import {
  DesktopWeekCalendar,
  type CalendarRendererProps,
} from './desktop-week-calendar'
import { MobileDayCalendar } from './mobile-day-calendar'
import { MobileMonthCalendar } from './mobile-month-calendar'
import { MobileWeekOverview } from './mobile-week-overview'
import { MoveAppointmentSheet } from './move-appointment-sheet'
import { TabletMultiDayCalendar } from './tablet-multi-day-calendar'

type CalendarSection = 'calendar' | 'waiting'
type QuickAction = 'delete' | 'toggle-lock'
const EMPTY_APPOINTMENTS: CalendarAppointment[] = []

type CalendarRangeSnapshot = [
  queryKey: QueryKey,
  data: CalendarAppointment[] | undefined,
]

type SupportedCalendarView = CalendarView
type TimelineCalendarView = Extract<CalendarView, 'day' | 'week'>

function isSupportedCalendarView(
  view: CalendarView | null,
): view is SupportedCalendarView {
  return (
    view === 'day'
    || view === 'week'
    || view === 'month'
    || view === 'agenda'
  )
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

function isCalendarRangeKey(queryKey: QueryKey, businessId: string) {
  return (
    queryKey[0] === 'calendar'
    && queryKey[1] === businessId
    && queryKey[2] === 'range'
    && typeof queryKey[3] === 'string'
    && typeof queryKey[4] === 'string'
  )
}

function appointmentForRange(
  appointments: CalendarAppointment[] | undefined,
  queryKey: QueryKey,
  appointment: CalendarAppointment,
) {
  if (!appointments) return appointments
  const withoutAppointment = appointments.filter(
    (candidate) => candidate.id !== appointment.id,
  )
  const from = String(queryKey[3])
  const to = String(queryKey[4])
  if (
    appointment.appointment_date >= from
    && appointment.appointment_date <= to
  ) {
    withoutAppointment.push(appointment)
  }
  return withoutAppointment.sort((left, right) => (
    left.appointment_date.localeCompare(right.appointment_date)
    || left.start_time.localeCompare(right.start_time)
  ))
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

export function useResponsiveCalendarLayout() {
  const [layout, setLayout] = useState<ResponsiveCalendarLayout>('phone')

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)')
    const update = () => setLayout(responsiveCalendarLayout(
      window.innerWidth,
      window.innerHeight,
      finePointer.matches,
    ))
    window.addEventListener('resize', update)
    finePointer.addEventListener('change', update)
    update()
    return () => {
      window.removeEventListener('resize', update)
      finePointer.removeEventListener('change', update)
    }
  }, [])

  return layout
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
  const [editorPresentation, setEditorPresentation] =
    useState<AppointmentEditorPresentation | null>(null)
  const [selectedAppointmentSnapshot, setSelectedAppointmentSnapshot] =
    useState<CalendarAppointment | null>(null)
  const [moveSheetOpen, setMoveSheetOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [preferencesRestored, setPreferencesRestored] = useState(false)
  const desktopOptimizeButtonRef = useRef<HTMLButtonElement>(null)
  const mobileOptimizeButtonRef = useRef<HTMLButtonElement>(null)
  const lastOptimizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const wasOptimizeOpenRef = useRef(false)
  const responsiveLayout = useResponsiveCalendarLayout()
  const isDesktop = responsiveLayout === 'desktop'
  const supportedView: SupportedCalendarView = isSupportedCalendarView(state.view)
    ? state.view
    : 'day'
  const rendererView: SupportedCalendarView = supportedView
  const timelineView: TimelineCalendarView = (
    rendererView === 'week' ? 'week' : 'day'
  )
  const range = useMemo(
    () => {
      if (responsiveLayout === 'three-day') {
        return {
          from: state.selectedDate,
          to: addBusinessDays(state.selectedDate, 2),
        }
      }
      if (responsiveLayout === 'seven-day') {
        return visibleSupportedRange(state.selectedDate, 'week')
      }
      return visibleSupportedRange(
        state.selectedDate,
        responsiveLayout === 'phone' ? rendererView : timelineView,
      )
    },
    [rendererView, responsiveLayout, state.selectedDate, timelineView],
  )
  const previousRange = useMemo(
    () => {
      if (responsiveLayout === 'three-day') {
        return {
          from: addBusinessDays(range.from, -3),
          to: addBusinessDays(range.to, -3),
        }
      }
      if (responsiveLayout === 'seven-day') {
        return adjacentRange(state.selectedDate, 'week', range, -1)
      }
      return adjacentRange(
        state.selectedDate,
        responsiveLayout === 'phone' ? rendererView : timelineView,
        range,
        -1,
      )
    },
    [range, rendererView, responsiveLayout, state.selectedDate, timelineView],
  )
  const nextRange = useMemo(
    () => {
      if (responsiveLayout === 'three-day') {
        return {
          from: addBusinessDays(range.from, 3),
          to: addBusinessDays(range.to, 3),
        }
      }
      if (responsiveLayout === 'seven-day') {
        return adjacentRange(state.selectedDate, 'week', range, 1)
      }
      return adjacentRange(
        state.selectedDate,
        responsiveLayout === 'phone' ? rendererView : timelineView,
        range,
        1,
      )
    },
    [range, rendererView, responsiveLayout, state.selectedDate, timelineView],
  )
  const optimizationScope: 'day' | 'week' | 'month' | 'custom' = (
    responsiveLayout === 'phone'
      ? rendererView === 'agenda' ? 'custom' : rendererView
      : responsiveLayout === 'desktop'
        ? timelineView
        : responsiveLayout === 'seven-day'
          ? 'week'
          : 'custom'
  )

  const [appointmentsQuery, configQuery] = useQueries({
    queries: [
      {
        queryKey: calendarKeys.range(businessId, range.from, range.to),
        queryFn: () => listAppointments(businessId, range.from, range.to),
        enabled: Boolean(businessId) && rendererView !== 'agenda',
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
    ? selectedAppointmentSnapshot?.id === state.selectedAppointmentId
      ? selectedAppointmentSnapshot
      : appointmentById.get(state.selectedAppointmentId) ?? null
    : null

  useEffect(() => {
    const storedView = parseStoredCalendarView(
      localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY),
    )
    const storedDensity = parseStoredCalendarDensity(
      localStorage.getItem(CALENDAR_DENSITY_STORAGE_KEY),
    )
    if (isSupportedCalendarView(storedView)) {
      dispatch({ type: 'set-view', view: storedView })
    } else {
      dispatch({ type: 'set-view', view: 'day' })
    }
    if (storedDensity !== null) {
      dispatch({ type: 'set-density', density: storedDensity })
    }
    setPreferencesRestored(true)
  }, [])

  useEffect(() => {
    if (!preferencesRestored) return
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, rendererView)
  }, [preferencesRestored, rendererView])

  useEffect(() => {
    if (!preferencesRestored) return
    localStorage.setItem(
      CALENDAR_DENSITY_STORAGE_KEY,
      String(state.density),
    )
  }, [preferencesRestored, state.density])

  useEffect(() => {
    if (!businessId || rendererView === 'agenda') return
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
    rendererView,
  ])

  const calendarRangeFilter = useMemo(() => ({
    queryKey: ['calendar', businessId, 'range'] as const,
  }), [businessId])

  const writeCalendarAppointment = useCallback((
    appointment: CalendarAppointment,
  ) => {
    setSelectedAppointmentSnapshot((current) => (
      current?.id === appointment.id ? appointment : current
    ))
    const ranges = queryClient.getQueriesData<CalendarAppointment[]>({
      queryKey: calendarRangeFilter.queryKey,
    })
    for (const [queryKey, data] of ranges) {
      if (!isCalendarRangeKey(queryKey, businessId)) continue
      queryClient.setQueryData<CalendarAppointment[]>(
        queryKey,
        appointmentForRange(data, queryKey, appointment),
      )
    }
  }, [businessId, calendarRangeFilter.queryKey, queryClient])

  const invalidateCalendarRanges = useCallback(() => {
    void queryClient.invalidateQueries(calendarRangeFilter)
    invalidateLegacyAppointments(queryClient)
  }, [calendarRangeFilter, queryClient])

  const undoCalendarChange = useCallback(async (
    before: CalendarAppointment,
    current: CalendarAppointment,
    kind: CalendarAppointmentChange['kind'],
  ) => {
    try {
      const request = undoCalendarChangeRequest(
        businessId,
        before,
        current,
        kind,
      )
      let result
      try {
        result = await mutateCalendarOrThrow(request)
      } catch (error) {
        if (!isCalendarWarningConfirmation(error)) throw error
        result = await confirmCalendarMutationInteractively(error)
      }
      if (result?.appointment) {
        writeCalendarAppointment(result.appointment)
        toast.success(t('cal.changeUndone'))
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('cal.undoFailed'),
      )
    } finally {
      invalidateCalendarRanges()
    }
  }, [
    businessId,
    invalidateCalendarRanges,
    t,
    writeCalendarAppointment,
  ])

  const showCalendarChangeSuccess = useCallback((
    before: CalendarAppointment,
    current: CalendarAppointment,
    change: CalendarAppointmentChange,
  ) => {
    toast.success(
      change.kind === 'move'
        ? t('cal.appointmentMoved')
        : t('cal.appointmentResized'),
      {
        duration: 8_000,
        action: {
          label: t('cal.undo'),
          onClick: () => {
            void undoCalendarChange(before, current, change.kind)
          },
        },
      },
    )
  }, [t, undoCalendarChange])

  const calendarChange = useMutation({
    mutationFn: async (change: CalendarAppointmentChange) => {
      const appointment = appointmentById.get(change.request.appointmentId)
      if (!appointment) {
        throw new Error(t('cal.appointmentUnavailable'))
      }
      return mutateCalendarOrThrow(
        calendarChangeRequest(businessId, appointment, change),
      )
    },
    onMutate: async (change) => {
      const before = appointmentById.get(change.request.appointmentId)
      if (!before) {
        throw new Error(t('cal.appointmentUnavailable'))
      }
      await queryClient.cancelQueries(calendarRangeFilter)
      const snapshots = (
        queryClient
          .getQueriesData<CalendarAppointment[]>(calendarRangeFilter)
          .filter(([queryKey]) => isCalendarRangeKey(queryKey, businessId))
      ) as CalendarRangeSnapshot[]
      const optimistic = optimisticCalendarAppointment(before, change)
      for (const [queryKey, data] of snapshots) {
        queryClient.setQueryData<CalendarAppointment[]>(
          queryKey,
          appointmentForRange(data, queryKey, optimistic),
        )
      }
      return { before, change, snapshots }
    },
    onSuccess: (result, change, context) => {
      if (!result.appointment || !context) return
      writeCalendarAppointment(result.appointment)
      showCalendarChangeSuccess(
        context.before,
        result.appointment,
        change,
      )
    },
    onError: async (error: unknown, change, context) => {
      for (const [queryKey, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, data)
      }
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(
          error instanceof Error ? error.message : t('cal.updateFailed'),
        )
        return
      }

      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (!confirmed?.appointment || !context) return
        writeCalendarAppointment(confirmed.appointment)
        showCalendarChangeSuccess(
          context.before,
          confirmed.appointment,
          change,
        )
      } catch (retryError) {
        toast.error(
          retryError instanceof Error
            ? retryError.message
            : t('cal.updateFailed'),
        )
      }
    },
    onSettled: invalidateCalendarRanges,
  })
  const mutateCalendarChange = calendarChange.mutate

  const finishQuickAction = useCallback((action: QuickAction) => {
    if (action === 'delete') {
      invalidateCalendarAppointments(queryClient, businessId)
      dispatch({ type: 'select-appointment', id: null })
    } else {
      invalidateLegacyAppointments(queryClient)
    }
  }, [businessId, queryClient])

  const quickAction = useMutation({
    mutationFn: async (action: QuickAction) => {
      if (!selectedAppointment) {
        throw new Error(t('cal.appointmentUnavailable'))
      }

      if (action === 'delete') {
        await deleteAppointment(
          businessId,
          selectedAppointment.id,
          selectedAppointment.version,
        )
        return { appointment: null }
      }

      const result = await mutateCalendarOrThrow({
        businessId,
        operation: selectedAppointment.locked ? 'unlock' : 'lock',
        appointmentId: selectedAppointment.id,
        expectedVersion: selectedAppointment.version,
        idempotencyKey: crypto.randomUUID(),
        values: {},
      })
      return { appointment: result.appointment }
    },
    onSuccess: (result, action) => {
      if (action === 'toggle-lock' && result?.appointment) {
        writeCalendarAppointment(result.appointment)
      }
      toast.success(
        action === 'delete'
          ? t('appt.deleted')
          : result?.appointment?.locked
            ? t('appt.locked')
            : t('appt.unlocked'),
      )
      finishQuickAction(action)
    },
    onError: async (error: unknown, action) => {
      if (!isCalendarWarningConfirmation(error)) {
        toast.error(
          error instanceof Error ? error.message : t('cal.updateFailed'),
        )
        return
      }

      try {
        const confirmed = await confirmCalendarMutationInteractively(error)
        if (confirmed?.appointment && action === 'toggle-lock') {
          writeCalendarAppointment(confirmed.appointment)
        }
        if (confirmed) finishQuickAction(action)
      } catch (retryError) {
        toast.error(
          retryError instanceof Error
            ? retryError.message
            : t('cal.updateFailed'),
        )
      }
    },
  })

  const handleSelectDate = useCallback((date: string) => {
    dispatch({ type: 'select-date', date })
  }, [])

  const handleSelectAppointment = useCallback((id: string) => {
    setSelectedAppointmentSnapshot(appointmentById.get(id) ?? null)
    setEditorPresentation(isDesktop ? 'dialog' : null)
    setMoveSheetOpen(false)
    setDuplicating(false)
    dispatch({ type: 'create-at', value: null })
    dispatch({ type: 'select-appointment', id })
  }, [appointmentById, isDesktop])

  const handleSelectAgendaAppointment = useCallback((
    appointment: CalendarAppointment,
  ) => {
    setSelectedAppointmentSnapshot(appointment)
    setEditorPresentation(null)
    setMoveSheetOpen(false)
    setDuplicating(false)
    dispatch({ type: 'create-at', value: null })
    dispatch({ type: 'select-appointment', id: appointment.id })
  }, [])

  const handleCreateAt = useCallback((date: string, startMinute: number) => {
    setEditorPresentation(isDesktop ? 'dialog' : 'drawer')
    dispatch({ type: 'select-appointment', id: null })
    dispatch({ type: 'create-at', value: { date, startMinute } })
  }, [isDesktop])

  const handleMove = useCallback((request: MoveIntent) => {
    mutateCalendarChange({ kind: 'move', request })
  }, [mutateCalendarChange])

  const handleResize = useCallback((request: ResizeIntent) => {
    mutateCalendarChange({ kind: 'resize', request })
  }, [mutateCalendarChange])

  const handleDensityChange = useCallback((density: number) => {
    dispatch({ type: 'set-density', density })
  }, [])

  const handleViewChange = useCallback((view: CalendarView) => {
    dispatch({ type: 'set-view', view })
  }, [])

  const handleOverviewDay = useCallback((date: string) => {
    dispatch({ type: 'select-date', date })
    dispatch({ type: 'set-view', view: 'day' })
  }, [])

  const handleOpenOptimizer = useCallback(() => {
    const activeElement = document.activeElement
    lastOptimizeButtonRef.current = activeElement instanceof HTMLButtonElement
      ? activeElement
      : null
    setOptimizeOpen(true)
  }, [])

  const handleOptimizeOpenChange = useCallback((open: boolean) => {
    setOptimizeOpen(open)
  }, [])

  useEffect(() => {
    if (wasOptimizeOpenRef.current && !optimizeOpen) {
      const lastButton = lastOptimizeButtonRef.current
      const fallbackButton = isDesktop
        ? desktopOptimizeButtonRef.current
        : mobileOptimizeButtonRef.current
      const focusTarget = lastButton?.isConnected ? lastButton : fallbackButton
      focusTarget?.focus()
    }
    wasOptimizeOpenRef.current = optimizeOpen
  }, [isDesktop, optimizeOpen])

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

  const quickSheetOpen = (
    !isDesktop
    && Boolean(selectedAppointment)
    && !editorPresentation
    && !moveSheetOpen
  )
  const appointmentDialogOpen = Boolean(
    state.createAt
    || (selectedAppointment && editorPresentation),
  )
  const dialogOpen = (
    appointmentDialogOpen
    || quickSheetOpen
    || moveSheetOpen
  )
  const navigate = useCallback((direction: -1 | 1) => {
    const navigationView = responsiveLayout === 'phone'
      ? rendererView
      : timelineView
    if (navigationView === 'month') {
      dispatch({
        type: 'select-date',
        date: shiftedSelectedDate('month', range, direction),
      })
      return
    }
    const amount = responsiveLayout === 'three-day'
      ? 3
      : responsiveLayout === 'seven-day'
        ? 7
        : navigationView === 'day'
          ? 1
          : 7
    dispatch({
      type: 'select-date',
      date: addBusinessDays(state.selectedDate, direction * amount),
    })
  }, [range, rendererView, responsiveLayout, state.selectedDate, timelineView])

  const openNew = useCallback(() => {
    handleCreateAt(state.selectedDate, 9 * 60)
  }, [handleCreateAt, state.selectedDate])

  const closeAppointmentDialog = useCallback((open: boolean) => {
    if (open) return
    setEditorPresentation(null)
    setSelectedAppointmentSnapshot(null)
    setDuplicating(false)
    dispatch({ type: 'select-appointment', id: null })
    dispatch({ type: 'create-at', value: null })
    invalidateCalendarAppointments(queryClient, businessId)
  }, [businessId, queryClient])

  const handleQuickSheetOpenChange = useCallback((open: boolean) => {
    if (open) return
    dispatch({ type: 'select-appointment', id: null })
  }, [])

  const handleMoveSheetOpenChange = useCallback((open: boolean) => {
    setMoveSheetOpen(open)
    if (!open) invalidateCalendarAppointments(queryClient, businessId)
  }, [businessId, queryClient])

  const handleMoved = useCallback(() => {
    setMoveSheetOpen(false)
    dispatch({ type: 'select-appointment', id: null })
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
        if (isDesktop) dispatch({ type: 'set-view', view: 'week' })
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
  }, [dialogOpen, isDesktop, navigate, openNew, section, timezone])

  const label = timelineView === 'day'
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
          {responsiveLayout === 'desktop' ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                <Button size="lg" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> {t('cal.new')}
                </Button>
                {businessId ? (
                  <Button
                    ref={desktopOptimizeButtonRef}
                    className="gap-2"
                    onClick={handleOpenOptimizer}
                  >
                    <Wand2 className="h-4 w-4" />
                    {t('sched.optimize')}
                  </Button>
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
                        timelineView === view
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`cal.view.${view}`)}
                    </button>
                  ))}
                </div>
              </div>

              <DesktopWeekCalendar {...rendererProps} view={timelineView} />
            </>
          ) : responsiveLayout === 'phone' && rendererView === 'agenda' ? (
            <CalendarAgenda
              businessId={businessId}
              config={config}
              selectedDate={state.selectedDate}
              onSelectDate={handleSelectDate}
              onSelectAppointment={handleSelectAgendaAppointment}
              onViewChange={handleViewChange}
              onOptimize={businessId ? handleOpenOptimizer : undefined}
              optimizeButtonRef={mobileOptimizeButtonRef}
            />
          ) : responsiveLayout === 'phone' && rendererView === 'month' ? (
            <MobileMonthCalendar
              appointments={appointments}
              config={config}
              selectedDate={state.selectedDate}
              onSelectDate={handleSelectDate}
              onSelectAppointment={handleSelectAppointment}
              onNavigateMonth={navigate}
              onViewChange={handleViewChange}
              onOptimize={businessId ? handleOpenOptimizer : undefined}
              optimizeButtonRef={mobileOptimizeButtonRef}
            />
          ) : responsiveLayout === 'phone' && rendererView === 'week' ? (
            <MobileWeekOverview
              appointments={appointments}
              config={config}
              selectedDate={state.selectedDate}
              onSelectDay={handleOverviewDay}
              onViewChange={handleViewChange}
              onOptimize={businessId ? handleOpenOptimizer : undefined}
              optimizeButtonRef={mobileOptimizeButtonRef}
            />
          ) : responsiveLayout === 'phone' ? (
            <>
              <MobileDayCalendar
                {...rendererProps}
                isLoading={
                  appointmentsQuery.isPending
                  || appointmentsQuery.isPlaceholderData
                  || configQuery.isPending
                  || configQuery.isPlaceholderData
                }
                onOptimize={businessId ? handleOpenOptimizer : undefined}
                optimizeButtonRef={mobileOptimizeButtonRef}
                onDensityChange={handleDensityChange}
                view={timelineView}
                onViewChange={handleViewChange}
              />
            </>
          ) : (
            <TabletMultiDayCalendar
              {...rendererProps}
              dayCount={responsiveLayout === 'seven-day' ? 7 : 3}
              view={timelineView}
              onDensityChange={handleDensityChange}
              onViewChange={handleViewChange}
              onOptimize={businessId ? handleOpenOptimizer : undefined}
              optimizeButtonRef={mobileOptimizeButtonRef}
            />
          )}

          {businessId ? (
            <ContextualOptimizeDialog
              businessId={businessId}
              scope={optimizationScope}
              dateFrom={range.from}
              dateTo={range.to}
              open={optimizeOpen}
              onOpenChange={handleOptimizeOpenChange}
            />
          ) : null}

          {businessId ? (
            <AppointmentQuickSheet
              open={quickSheetOpen}
              appointment={selectedAppointment}
              onOpenChange={handleQuickSheetOpenChange}
              onMove={() => {
                setDuplicating(false)
                setMoveSheetOpen(true)
              }}
              onEdit={() => {
                setDuplicating(false)
                setEditorPresentation('drawer')
              }}
              onToggleLock={() => quickAction.mutate('toggle-lock')}
              onDuplicate={() => {
                setDuplicating(true)
                setEditorPresentation('drawer')
              }}
              onDelete={() => quickAction.mutate('delete')}
              lockPending={
                quickAction.isPending
                && quickAction.variables === 'toggle-lock'
              }
              deletePending={
                quickAction.isPending
                && quickAction.variables === 'delete'
              }
            />
          ) : null}

          {businessId ? (
            <MoveAppointmentSheet
              businessId={businessId}
              appointment={selectedAppointment}
              open={moveSheetOpen}
              onOpenChange={handleMoveSheetOpenChange}
              onMoved={handleMoved}
            />
          ) : null}

          {businessId ? (
            <AppointmentDialog
              businessId={businessId}
              appt={(state.createAt || duplicating) ? null : selectedAppointment}
              defaultDate={
                state.createAt?.date
                ?? (duplicating ? selectedAppointment?.appointment_date : undefined)
              }
              defaultStart={
                state.createAt
                  ? minToTime(state.createAt.startMinute).slice(0, 5)
                  : duplicating
                    ? selectedAppointment?.start_time.slice(0, 5)
                    : undefined
              }
              defaultPatientId={
                duplicating ? selectedAppointment?.patient_id : undefined
              }
              defaultServiceId={
                duplicating ? selectedAppointment?.service_id ?? undefined : undefined
              }
              defaultDurationMinutes={
                duplicating ? selectedAppointment?.duration_minutes : undefined
              }
              open={appointmentDialogOpen}
              presentation={
                editorPresentation ?? (isDesktop ? 'dialog' : 'drawer')
              }
              onOpenChange={closeAppointmentDialog}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
