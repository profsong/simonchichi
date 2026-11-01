import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Mascot, MascotMark, type AvatarId } from '../../src/components/Mascot';
import { resolveAvatar } from '../../src/core/avatar';

describe('exploration companions', () => {
  it.each([
    [undefined, 'monchichi'],
    ['lumi', 'monchichi'],
    ['monchichi', 'monchichi'],
    ['momo', 'sichiware'],
    ['sichiware', 'sichiware'],
    ['nova', 'sipompurin'],
    ['sipompurin', 'sipompurin'],
  ] as const)('renders the current companion for saved avatar %s', (saved, current) => {
    expect(resolveAvatar(saved)).toBe(current);
    expect(renderToStaticMarkup(<Mascot variant={saved} />)).toBe(
      renderToStaticMarkup(<Mascot variant={current} />),
    );
    expect(renderToStaticMarkup(<MascotMark variant={saved} />)).toBe(
      renderToStaticMarkup(<MascotMark variant={current} />),
    );
  });

  it.each(['monchichi', 'sichiware', 'sipompurin'] as const)(
    'keeps %s expressions self-contained and decorative',
    (variant: AvatarId) => {
      const expressions = ['happy', 'thinking', 'celebrate', 'encourage'].map((mood) =>
        renderToStaticMarkup(
          <Mascot
            variant={variant}
            mood={mood as 'happy' | 'thinking' | 'celebrate' | 'encourage'}
          />,
        ),
      );
      expect(new Set(expressions).size).toBe(4);
      expressions.forEach((svg) => {
        expect(svg).toContain('aria-hidden="true"');
        expect(svg).toContain('focusable="false"');
        expect(svg).not.toContain('<image');
        expect(svg).not.toContain('href=');
      });
    },
  );
});
