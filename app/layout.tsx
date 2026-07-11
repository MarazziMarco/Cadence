import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Providers } from './providers'

// Body/UI font — clean and highly legible. Display font — Space Grotesk gives
// headings a modern, professional character. Loaded via next/font (no external
// <link>) and exposed as CSS variables consumed by the Tailwind theme.
const fontSans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const fontDisplay = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' })

export const metadata: Metadata = {
  title: 'Cadence — Smart Scheduling for Modern Businesses',
  description:
    'Cadence is the AI scheduling platform for appointment-based businesses. Fill every gap, protect your best clients, and save hours every week.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Cadence' },
}

export const viewport: Viewport = {
  themeColor: '#6d4bd8',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
