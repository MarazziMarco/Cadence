import { LogoLoader } from '@/components/brand/logo-loader'

// Shown instantly while an (app) route loads — on first entry after login and
// when switching between menu items — so navigation feels responsive.
export default function AppLoading() {
  return <LogoLoader />
}
