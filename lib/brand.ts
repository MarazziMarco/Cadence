export const BRAND = {
  name: 'Cadence',
  tagline: 'The smartest way to run your schedule.',
  description:
    'Cadence is the AI scheduling platform for appointment-based businesses. Fill every gap, protect your best clients, and save hours every week.',
} as const

export const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/calendar', label: 'Calendar', icon: 'CalendarDays' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/patients', label: 'Clients', icon: 'Users' },
      { href: '/services', label: 'Services', icon: 'Sparkles' },
      { href: '/working-hours', label: 'Working Hours', icon: 'Clock' },
      { href: '/waiting-list', label: 'Waiting List', icon: 'ListChecks' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/scheduler', label: 'Scheduler', icon: 'Wand2' },
      { href: '/ai-assistant', label: 'AI Assistant', icon: 'Bot' },
      { href: '/analytics', label: 'Analytics', icon: 'BarChart3' },
    ],
  },
  {
    label: 'Configure',
    items: [
      { href: '/templates', label: 'Templates', icon: 'FileText' },
      { href: '/settings', label: 'Settings', icon: 'Settings' },
      { href: '/lab', label: 'Experimental Lab', icon: 'FlaskConical' },
    ],
  },
] as const
