import { CalendarDays } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function CalendarPage() {
  return <ModuleScaffold title="Calendar" description="Your appointments across day, week and month." icon={CalendarDays} emptyTitle="Calendar is being wired up" emptyDesc="A Google-Calendar-quality view with drag & drop is next. It will read live appointments from your database." />
}
