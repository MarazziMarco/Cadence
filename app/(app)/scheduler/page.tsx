import { Wand2 } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function SchedulerPage() {
  return <ModuleScaffold title="Scheduler" description="The optimizer that builds your best possible day." icon={Wand2} emptyTitle="The heart of Cadence" emptyDesc="Hard & soft constraints, optimization preview, explanations and undo — all coming here." />
}
