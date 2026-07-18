import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BottomNav } from '@/components/app-shell/bottom-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
}))

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({
    t: (key: string) => key,
  }),
}))

describe('BottomNav mobile voice action', () => {
  it('opens voice creation directly from the central microphone button', () => {
    const onQuickCreate = vi.fn()
    render(<BottomNav onQuickCreate={onQuickCreate} />)

    const voiceButton = screen.getByRole('button', { name: 'create.speak' })
    expect(voiceButton.querySelector('.lucide-mic')).toBeInTheDocument()

    fireEvent.click(voiceButton)

    expect(onQuickCreate).toHaveBeenCalledOnce()
    expect(onQuickCreate).toHaveBeenCalledWith('voice')
  })
})
