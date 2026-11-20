import { Nav as NanoNav } from 'nano-ux';
import { IArrowUpRight, IGitHub } from 'nano-ux/icons';
import React from 'react';

const guideLinks = [
  { id: 'nano-fw', label: 'Introduction' },
  { id: 'install', label: 'Install' },
  { id: 'routing', label: 'Routing' },
  { id: 'error-handling', label: 'Error handling' },
  { id: 'database', label: 'Database' },
];
const referenceLinks = [
  { id: 'api-reference', label: 'Overview' },
  { id: 'api-http', label: 'nano-fw' },
  { id: 'api-data', label: 'nano-fw/data' },
];
const groups = [
  { title: 'Guide', links: guideLinks },
  { title: 'API Reference', links: referenceLinks },
];

export const Nav = () => {
  const [activeId, setActiveId] = React.useState('');

  React.useEffect(() => {
    const headings = groups.flatMap(({ links }) => links).map(({ id }) => document.getElementById(id)).filter((heading) => heading !== null);

    const updateSection = () => {
      const heading = headings.findLast((element) => element.getBoundingClientRect().top <= 96);

      setActiveId(heading?.id ?? 'nano-fw');
    };

    updateSection();
    window.addEventListener('scroll', updateSection, { passive: true });
    window.addEventListener('resize', updateSection);

    return () => {
      window.removeEventListener('scroll', updateSection);
      window.removeEventListener('resize', updateSection);
    };
  }, []);

  return (
    <NanoNav label="Contents">
      {groups.map(({ title, links }) => (
        <details key={title} className="nav-group" open>
          <summary>{title}</summary>
          {links.map(({ id, label }) => (
            <a key={id} href={`#${id}`} aria-current={activeId === id ? 'location' : undefined}>
              {label}
            </a>
          ))}
        </details>
      ))}
      <a
        className="github-link"
        href="https://github.com/damianobarbati/nano-fw"
        target="_blank"
        rel="noopener noreferrer"
      >
        <IGitHub aria-hidden="true" size="1em" />
        <span>GitHub</span>
        <IArrowUpRight aria-hidden="true" size="1em" />
      </a>
    </NanoNav>
  );
};
