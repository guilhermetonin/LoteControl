import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';

describe('Header Component', () => {
  it('renders the Settings button with gear icon and triggers onToggleSidebar', () => {
    const handleToggle = vi.fn();
    render(
      <Header
        currentSection="conferencia"
        onNavigate={vi.fn()}
        conferencesCount={2}
        hasActiveFile={true}
        isSidebarOpen={false}
        onToggleSidebar={handleToggle}
        onImportNewFile={vi.fn()}
      />
    );

    const settingsBtn = screen.getByRole('button', { name: /abrir configurações/i });
    expect(settingsBtn).toBeInTheDocument();

    fireEvent.click(settingsBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);

    // The global logo lives in the app shell so each module header stays compact.
    expect(screen.queryByAltText('LoteControl')).not.toBeInTheDocument();
  });
});
