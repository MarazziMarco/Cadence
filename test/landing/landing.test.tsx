import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Landing } from '@/components/landing/landing'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props}>{children}</button>,
}))

describe('Landing localization and story integration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it('defaults to a complete English landing with one eight-step story', () => {
    render(<Landing />)

    expect(screen.getByRole('heading', {
      name: "Stop losing your Sunday to next week's schedule",
    })).toBeInTheDocument()
    expect(screen.getAllByTestId('product-story-chapter')).toHaveLength(8)
    expect(screen.getByText('Your whole schedule, in your pocket')).toBeInTheDocument()
    expect(screen.getByText(/Cadence is a demo \/ prototype/)).toBeInTheDocument()
  })

  it('removes the standalone voice card and keeps only the first three feature cards', () => {
    render(<Landing />)

    expect(screen.queryByText('Natural language & voice')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('landing-feature-card')).toHaveLength(3)
    expect(screen.getByText('Auto-optimized schedule')).toBeInTheDocument()
    expect(screen.getByText('Natural language AI')).toBeInTheDocument()
    expect(screen.getByText('You stay in control')).toBeInTheDocument()
    expect(screen.queryByText('Revenue insights')).not.toBeInTheDocument()
    expect(screen.queryByText('Works for any business')).not.toBeInTheDocument()
  })

  it('clips horizontal overflow without breaking the sticky story stage', () => {
    render(<Landing />)

    expect(screen.getByTestId('landing-root')).toHaveClass('overflow-x-clip')
    expect(screen.getByTestId('landing-root')).not.toHaveClass('overflow-x-hidden')
  })

  it('shows the selected real mobile product screenshots', () => {
    render(<Landing />)

    const images = screen.getAllByRole('img')
    expect(images.map((image) => image.getAttribute('src'))).toEqual(expect.arrayContaining([
      '/landing/mobile-calendar.png',
      '/landing/mobile-clients.png',
      '/landing/mobile-voice.png',
      '/landing/mobile-scheduler.png',
    ]))

    const calendar = images.find(
      (image) => image.getAttribute('src') === '/landing/mobile-calendar.png',
    )
    expect(calendar).toHaveClass('h-auto', 'w-full', 'object-contain')
    expect(calendar).not.toHaveClass('h-full', 'object-cover')
  })

  it('keeps the floating messages outside the hero phone', () => {
    render(<Landing />)

    const cards = screen.getAllByTestId('phone-floating-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveClass('sm:-right-28', 'xl:-right-36')
    expect(cards[1]).toHaveClass('sm:-right-28', 'xl:-right-36')
    expect(cards[2]).toHaveClass('sm:-left-28', 'xl:-left-36')
  })

  it('switches the entire landing to Italian and restores that choice', async () => {
    const user = userEvent.setup()
    const first = render(<Landing />)

    await user.click(screen.getByRole('button', { name: 'Italiano' }))

    expect(screen.getByRole('heading', {
      name: 'Smetti di sacrificare la domenica per organizzare la settimana',
    })).toBeInTheDocument()
    expect(screen.getByText('Prenota con la voce')).toBeInTheDocument()
    expect(screen.getByText('Tutta la tua agenda, in tasca')).toBeInTheDocument()
    expect(screen.getByText('Agenda ottimizzata automaticamente')).toBeInTheDocument()
    expect(screen.getByText(/Cadence è una demo \/ un prototipo/)).toBeInTheDocument()
    expect(localStorage.getItem('cadence-landing-locale')).toBe('it')

    first.unmount()
    render(<Landing />)
    await waitFor(() => {
      expect(screen.getByRole('heading', {
        name: 'Smetti di sacrificare la domenica per organizzare la settimana',
      })).toBeInTheDocument()
    })
  })

  it('supports Spanish and falls back to English for invalid storage', async () => {
    const user = userEvent.setup()
    const first = render(<Landing />)

    await user.click(screen.getByRole('button', { name: 'Español' }))
    expect(screen.getByRole('heading', {
      name: 'Deja de perder el domingo organizando la próxima semana',
    })).toBeInTheDocument()
    await user.click(screen.getByRole('button', {
      name: 'Show Convierte cancelaciones en oportunidades',
    }))
    await waitFor(() => {
      expect(screen.getByRole('heading', {
        name: 'Convierte cancelaciones en oportunidades',
      })).toBeInTheDocument()
    })
    expect(screen.getByText(/Cadence es una demo \/ un prototipo/)).toBeInTheDocument()

    first.unmount()
    localStorage.setItem('cadence-landing-locale', 'de')
    render(<Landing />)
    expect(screen.getByRole('heading', {
      name: "Stop losing your Sunday to next week's schedule",
    })).toBeInTheDocument()
  })
})
