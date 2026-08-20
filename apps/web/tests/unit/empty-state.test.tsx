// apps/web/tests/unit/empty-state.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@/components/domain/updates/empty-state';

describe('EmptyState', () => {
  it('renders headline', () => {
    render(<EmptyState onSubmitClick={vi.fn()} />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('renders subtext', () => {
    render(<EmptyState onSubmitClick={vi.fn()} />);
    expect(screen.getByText(/submit your update for today/i)).toBeInTheDocument();
  });

  it('renders CTA button', () => {
    render(<EmptyState onSubmitClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /submit update/i })).toBeInTheDocument();
  });

  it('CTA fires onSubmitClick', () => {
    const onSubmitClick = vi.fn();
    render(<EmptyState onSubmitClick={onSubmitClick} />);
    fireEvent.click(screen.getByRole('button', { name: /submit update/i }));
    expect(onSubmitClick).toHaveBeenCalledOnce();
  });
});
