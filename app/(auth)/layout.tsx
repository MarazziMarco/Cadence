'use client'

import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { usePublicT } from '@/lib/i18n/use-public-t'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = usePublicT()

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-[hsl(255_70%_55%)] to-[hsl(262_83%_45%)] lg:block">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Link href="/"><Logo className="[&_img]:brightness-0 [&_img]:invert" /></Link>
          <div>
            <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">{t('auth.layoutTitle')}</h2>
            <p className="mt-4 max-w-md text-white/80">{t('auth.layoutDescription')}</p>
          </div>
          <p className="text-sm text-white/60">{t('auth.layoutTrust')}</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Link href="/"><Logo /></Link></div>
          {children}
        </div>
      </div>
    </div>
  )
}
