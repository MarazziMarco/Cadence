import { ListChecks } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function WaitingListPage() {
  return <ModuleScaffold title="Waiting List" description="Clients ready to fill any gap that opens up." icon={ListChecks} emptyTitle="Waiting list coming online" emptyDesc="Priority, flexibility and preferred days/hours drive automatic gap-filling." />
}
