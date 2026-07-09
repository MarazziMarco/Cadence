import { BarChart3 } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function AnalyticsPage() {
  return <ModuleScaffold title="Analytics" description="Occupancy, revenue and optimization impact." icon={BarChart3} emptyTitle="Analytics coming online" emptyDesc="Beautiful charts for occupancy, idle time, revenue and AI usage." />
}
