'use client';

import { useEffect, useRef, useState } from 'react';

export type CubeDiagramProps = {
  algorithm: string;
  category?: string;
  label: string;
  /** Setas de troca "FROM->TO:cor,..." (PLL). Vazio = sem setas. */
  arrows?: string;
  /** Largura e altura em pixels. */
  size?: number;
};

type CubeIconsAPI = { processAll: (root?: Element) => void };
declare global { interface Window { CubeIcons?: CubeIconsAPI } }

let libraryLoad: Promise<CubeIconsAPI> | undefined;

/** One shared, self-hosted load for every diagram on the page. */
function loadCubeIcons(): Promise<CubeIconsAPI> {
  if (!document.getElementById('cube-icons-styles')) {
    const stylesheet = document.createElement('link');
    stylesheet.id = 'cube-icons-styles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/vendor/cube-icons.css';
    document.head.appendChild(stylesheet);
  }
  if (window.CubeIcons) return Promise.resolve(window.CubeIcons);
  if (libraryLoad) return libraryLoad;
  libraryLoad = new Promise<CubeIconsAPI>((resolve, reject) => {
    const existing = document.getElementById('cube-icons-script') as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    script.id = 'cube-icons-script';
    script.src = '/vendor/cube-icons.js';
    script.async = true;
    script.addEventListener('load', () => {
      if (window.CubeIcons) resolve(window.CubeIcons);
      else { script.remove(); libraryLoad = undefined; reject(new Error('CubeIcons indisponível')); }
    }, { once: true });
    script.addEventListener('error', () => {
      script.remove();
      libraryLoad = undefined;
      reject(new Error('Falha ao carregar CubeIcons'));
    }, { once: true });
    if (!existing) document.head.appendChild(script);
  });
  return libraryLoad;
}

/**
 * Exact inverse case, not a random scramble.
 * Default library base: U white, F green. x2 y2 makes U yellow AND F green.
 * ci-inverse reverses the whole sequence, so the data algorithm must end in
 * "y2 x2": inverse(solution y2 x2) = x2 y2 inverse(solution).
 * OLL uses ci-oll instead: it shows the case itself on the already-yellow top,
 * so it takes the algorithm as written (no inverse, no y2 x2).
 * PLL uses the same setup as F2L; swap arrows (data-ci-arrows) are drawn only when
 * the case has them (pure permutations; see the algorithms catalogue).
 */
export default function CubeDiagram({ algorithm, category, label, arrows = '', size = 180 }: CubeDiagramProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const pixels = Number.isFinite(size) ? Math.min(600, Math.max(64, size)) : 180;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    setStatus('loading');
    // React owns the host only; CubeIcons owns the imperative child/SVG.
    const icon = document.createElement('i');
    if (category === 'OLL') {
      icon.className = 'ci ci-3x3 ci-iso ci-oll';
      icon.setAttribute('data-ci-alg', algorithm.trim());
    } else if (category === 'PLL' && arrows) {
      // Top view, as in the e-book: flat U face with the swap arrows on it.
      icon.className = 'ci ci-3x3 ci-top ci-inverse';
      icon.setAttribute('data-ci-alg', `${algorithm.trim()} y2 x2`);
    } else {
      icon.className = 'ci ci-3x3 ci-iso ci-inverse';
      icon.setAttribute('data-ci-alg', `${algorithm.trim()} y2 x2`);
    }
    if (category === 'PLL' && arrows) icon.setAttribute('data-ci-arrows', arrows);
    icon.setAttribute('data-ci-theme', 'light');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.width = '100%';
    icon.style.height = '100%';
    icon.style.display = 'block';
    host.replaceChildren(icon);
    loadCubeIcons().then(icons => {
      if (!active) return;
      // processAll skips data-ci-rendered; replacing the child on updates
      // ensures that a new solution always produces a new diagram.
      icons.processAll(host);
      setStatus(icon.querySelector('svg') ? 'ready' : 'error');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; host.replaceChildren(); };
  }, [algorithm, category, arrows]);

  return (
    <span
      role="img"
      aria-label={`${label}. Centro amarelo em cima (U), verde à frente (F). Estado anterior ao algoritmo de solução.`}
      aria-busy={status === 'loading'}
      data-category={category}
      data-cube-status={status}
      style={{ display: 'inline-grid', width: pixels, height: pixels, maxWidth: '100%', verticalAlign: 'middle', position: 'relative' }}
    >
      <span ref={hostRef} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />
      {status === 'error' && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12 }}>Diagrama indisponível. Consulte a sequência e a orientação.</span>}
    </span>
  );
}
