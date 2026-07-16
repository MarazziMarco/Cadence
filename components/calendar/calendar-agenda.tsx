'use client'

import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'

import {
  fmtTime,
  listPatientsForSelect,
  type CalendarAppointment,
} from '@/lib/api/appointments'
import {
  listAgendaPage,
  type CalendarConfig,
} from '@/lib/api/calendar'
import { listServices } from '@/lib/api/services'
import { groupAgendaAppointments } from '@/lib/calendar/agenda'
import { businessToday, formatBusinessDate } from '@/lib/calendar/date'
import { calendarKeys } from '@/lib/calendar/query-keys'
import type { AgendaFilters, CalendarView } from '@/lib/calendar/types'
import { bcp47 } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { CalendarToolbar } from './calendar-toolbar'

interface CalendarAgendaProps {
  businessId: string
  config: CalendarConfig
  selectedDate: string
  onSelectDate(date: string): void
  onSelectAppointment(appointment: CalendarAppointment): void
  onViewChange(view: CalendarView): void
  onOptimize?(): void
  optimizeButtonRef?: Ref<HTMLButtonElement>
}

function patientName(appointment: CalendarAppointment, fallback: string) {
  return (
    appointment.patients?.full_name
    || [appointment.patients?.first_name, appointment.patients?.last_name]
      .filter(Boolean)
      .join(' ')
    || fallback
  )
}

export function CalendarAgenda({
  businessId,
  config,
  selectedDate,
  onSelectDate,
  onSelectAppointment,
  onViewChange,
  onOptimize,
  optimizeButtonRef,
}: CalendarAgendaProps) {
  const { t, locale } = useT()
  const dateLocale = bcp47(locale)
  const [filters, setFilters] = useState<AgendaFilters>({})
  const sentinelRef = useRef<HTMLDivElement>(null)
  const patientsQuery = useQuery({
    queryKey: ['patients-select', businessId],
    queryFn: () => listPatientsForSelect(businessId),
    enabled: Boolean(businessId),
  })
  const servicesQuery = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => listServices(businessId),
    enabled: Boolean(businessId),
  })
  const agendaQuery = useInfiniteQuery({
    queryKey: [...calendarKeys.agenda(businessId, filters), selectedDate],
    queryFn: ({ pageParam }) => listAgendaPage(
      businessId,
      selectedDate,
      filters,
      pageParam,
    ),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(businessId),
  })
  const appointments = useMemo(
    () => agendaQuery.data?.pages.flatMap((page) => page.appointments) ?? [],
    [agendaQuery.data],
  )
  const groups = useMemo(
    () => groupAgendaAppointments(appointments),
    [appointments],
  )

  useEffect(() => {
    const target = sentinelRef.current
    if (!target || !agendaQuery.hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void agendaQuery.fetchNextPage()
      }
    }, { rootMargin: '240px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [agendaQuery.fetchNextPage, agendaQuery.hasNextPage])

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <CalendarToolbar
        selectedDate={selectedDate}
        view="agenda"
        enabledViews={['day', 'week', 'month', 'agenda']}
        onToday={() => onSelectDate(businessToday(config.timezone))}
        onViewChange={onViewChange}
        onOptimize={onOptimize}
        optimizeButtonRef={optimizeButtonRef}
      />
      <div className="grid grid-cols-1 gap-2 border-y border-border bg-muted/25 p-2 sm:grid-cols-3">
        <select
          aria-label={t('appt.patient')}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={filters.patientId ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            patientId: event.target.value || undefined,
          }))}
        >
          <option value="">{t('appt.patient')}</option>
          {(patientsQuery.data ?? []).map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.full_name
                || [patient.first_name, patient.last_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
        <select
          aria-label={t('appt.service')}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={filters.serviceId ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            serviceId: event.target.value || undefined,
          }))}
        >
          <option value="">{t('appt.service')}</option>
          {(servicesQuery.data ?? []).map((service) => (
            <option key={service.id} value={service.id}>{service.name}</option>
          ))}
        </select>
        <select
          aria-label={t('pat.status')}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
          value={filters.status ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            status: (event.target.value || undefined) as AgendaFilters['status'],
          }))}
        >
          <option value="">{t('pat.status')}</option>
          {(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] as const)
            .map((status) => (
              <option key={status} value={status}>
                {t(`cal.status.${status}`)}
              </option>
            ))}
        </select>
      </div>

      <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto">
        {groups.map((group) => (
          <section key={group.date}>
            <h2 className="sticky top-0 z-10 border-y border-border bg-card/95 px-3 py-2 text-sm font-bold capitalize backdrop-blur">
              {formatBusinessDate(group.date, dateLocale, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <div className="divide-y divide-border">
              {group.appointments.map((appointment) => {
                const patient = patientName(appointment, t('dash.client'))
                const service = appointment.title
                  || appointment.services?.name
                  || t('dash.appointment')
                const status = t(`cal.status.${appointment.status}`)
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    data-appointment-id={appointment.id}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={[
                      fmtTime(appointment.start_time),
                      patient,
                      service,
                      status,
                    ].join(', ')}
                    onClick={() => onSelectAppointment(appointment)}
                  >
                    <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                      {fmtTime(appointment.start_time)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {patient}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {service} · {status}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        {agendaQuery.isPending ? (
          <p role="status" className="p-4 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </p>
        ) : null}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>
    </section>
  )
}
