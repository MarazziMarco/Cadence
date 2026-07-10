export const BRAND = {
  name: 'Cadence',
  tagline: 'The smartest way to run your schedule.',
  description:
    'Cadence is the AI scheduling platform for appointment-based businesses. Fill every gap, protect your best clients, and save hours every week.',
} as const

export const NAV_SECTIONS = [
  {
    label: 'Menu',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/calendar', label: 'Calendar', icon: 'CalendarDays' },
      { href: '/patients', label: 'Clients', icon: 'Users' },
      { href: '/services', label: 'Services', icon: 'Sparkles' },
      { href: '/scheduler', label: 'Scheduler', icon: 'Wand2' },
      { href: '/settings', label: 'Settings', icon: 'Settings' },
    ],
  },
] as const
