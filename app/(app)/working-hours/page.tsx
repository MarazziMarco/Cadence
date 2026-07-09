import { Clock } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function WorkingHoursPage() {
  return <ModuleScaffold title="Working Hours" description="Your weekly availability and breaks." icon={Clock} emptyTitle="Working hours coming online" emptyDesc="Set weekly hours, lunch breaks and holidays that the scheduler always respects." />
}
