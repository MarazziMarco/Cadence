import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LandingLanguageSwitcher } from '@/components/landing/landing-language-switcher'

describe('LandingLanguageSwitcher', () => {
  it('exposes and changes the complete public-page language', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <LandingLanguageSwitcher locale="en" onChange={onChange} />,
    )

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Italiano' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: 'Italiano' }))
    await user.click(screen.getByRole('button', { name: 'Español' }))

    expect(onChange.mock.calls).toEqual([['it'], ['es']])
  })
})
