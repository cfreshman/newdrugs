import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PanelReadinessContext, PanelVisibilityContext, type PanelReadiness } from './PanelReadiness';

/** Real height animation; child screens fill the available space above the controls. */
export function ComposerPanel({ open, input, children, contentKey = '', extentKey = '', dragging = false, obscured = false, sideBySide = false }: { open: boolean; input: ReactNode; children: ReactNode; contentKey?: string; extentKey?: string; dragging?: boolean; obscured?: boolean; sideBySide?: boolean }) {
  const frame = useRef<HTMLDivElement>(null), inputLayer = useRef<HTMLDivElement>(null), menuLayer = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null), initialized = useRef(false);
  const readiness = useRef<PanelReadiness>({ pending: new Set(), listeners: new Set() });
  const targetHeight = useRef(0);
  useLayoutEffect(() => {
    const node = frame.current!, input = inputLayer.current!, menu = menuLayer.current!;
    const body = menu.querySelector<HTMLElement>('.composer-view:not([hidden]) .composer-surface-body');
    const footer = menu.querySelector<HTMLElement>('.composer-view:not([hidden]) .composer-surface-footer');
    const content = body || menu.querySelector<HTMLElement>('.composer-view:not([hidden])') || menu.firstElementChild as HTMLElement;
    const resize = (target: number) => {
      if (target === targetHeight.current) return;
      const previous = node.getBoundingClientRect().height;
      targetHeight.current = target; animation.current?.cancel(); node.style.height = `${target}px`;
      if (initialized.current && !dragging && Math.abs(previous - target) > 1) {
        animation.current = node.animate([{ height: `${previous}px` }, { height: `${target}px` }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      initialized.current = true;
    };
    const fit = () => {
      node.toggleAttribute('data-loading', open && readiness.current.pending.size > 0);
      if (open && !body && initialized.current && readiness.current.pending.size) return;
      const style = getComputedStyle(menu);
      const natural = (content?.offsetHeight || 0) + (footer?.offsetHeight || 0) + parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
      const limit = parseFloat(style.maxHeight);
      const panelHeight = Math.max(76, body && Number.isFinite(limit) ? limit : Math.min(natural, Number.isFinite(limit) ? limit : natural));
      menu.style.height = sideBySide && open ? `${panelHeight}px` : '';
      const target = open && !sideBySide ? panelHeight : input.offsetHeight;
      if (!target || target === targetHeight.current) return;
      resize(target);
    };
    fit(); const observer = new ResizeObserver(fit);
    observer.observe(input); if (content) observer.observe(content); if (footer) observer.observe(footer);
    window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit); readiness.current.listeners.add(fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); readiness.current.listeners.delete(fit); };
  }, [open, contentKey, extentKey, dragging, sideBySide]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return <PanelReadinessContext.Provider value={readiness.current}><div className={`composer-switcher ${open ? 'launcher-open' : ''} ${sideBySide ? 'side-open' : ''}`} ref={frame}>
    <div ref={inputLayer} className="composer-input-layer" inert={open && !sideBySide} aria-hidden={open && !sideBySide || undefined}>{input}</div>
    <div ref={menuLayer} className="composer-menu-layer" inert={!open} aria-hidden={!open || undefined}><PanelVisibilityContext.Provider value={open && !obscured}>{children}</PanelVisibilityContext.Provider></div>
  </div></PanelReadinessContext.Provider>;
}
