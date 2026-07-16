import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { cn } from '@/lib/utils'

it('resolves aliases and provides DOM matchers', () => {
  render(<button className={cn('base', false && 'hidden')}>Ready</button>)
  expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass('base')
  expect(screen.getByRole('button', { name: 'Ready' })).not.toHaveClass('hidden')
})
