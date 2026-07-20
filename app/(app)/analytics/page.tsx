'use client'

import { BarChart3 } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'
import { useT } from '@/lib/i18n/use-t'

export default function AnalyticsPage() {
  const { t } = useT()
  return <ModuleScaffold title={t('nav.analytics')} description={t('analytics.subtitle')} icon={BarChart3} emptyTitle={t('analytics.emptyTitle')} emptyDesc={t('analytics.emptyDescription')} />
}
