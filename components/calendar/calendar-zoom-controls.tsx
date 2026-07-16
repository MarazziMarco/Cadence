'use client'

import { Minus, Plus, RotateCcw } from 'lucide-react'

import {
  DEFAULT_DENSITY,
  clampDensity,
} from '@/lib/calendar/geometry'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'

interface CalendarZoomControlsProps {
  density: number
  onDensityChange(density: number): void
}

export function CalendarZoomControls({
  density,
  onDensityChange,
}: CalendarZoomControlsProps) {
  const { t } = useT()

  return (
    <div
      role="group"
      aria-label={t('cal.zoomControls')}
      className="absolute bottom-3 right-3 z-40 flex rounded-lg border border-border bg-background/95 p-0.5 shadow-sm backdrop-blur"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label={t('cal.zoomOut')}
        onClick={() => onDensityChange(clampDensity(density - 12))}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label={t('cal.zoomReset')}
        onClick={() => onDensityChange(DEFAULT_DENSITY)}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        aria-label={t('cal.zoomIn')}
        onClick={() => onDensityChange(clampDensity(density + 12))}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
