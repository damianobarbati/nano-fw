import { PageLayout, ThemeSelector } from 'nano-ux';
import { createRoot } from 'react-dom/client';
import { Guide } from './Guide.tsx';
import { Nav } from './Nav.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element.');

createRoot(root).render(
  <>
    <header className="guide-header border-border bg-surface sticky top-0 flex items-center justify-between gap-4 border-b">
      <a className="brand inline-flex items-center gap-2" href="#nano-fw">
        <img src="./logo.svg" alt="" />
        nano-fw
      </a>
      <Nav />
      <ThemeSelector className="guide-theme relative inset-auto" tooltipPlacement="bottom" />
    </header>
    <PageLayout contentClassName="guide">
      <Guide />
    </PageLayout>
  </>,
);
