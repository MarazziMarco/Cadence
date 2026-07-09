import { Users } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function PatientsPage() {
  return <ModuleScaffold title="Clients" description="Everyone you serve — with tags, notes and history." icon={Users} emptyTitle="Clients coming online" emptyDesc="Fast search, VIP flags, preferred availability and full appointment history will live here." />
}
