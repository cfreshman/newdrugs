import {useTopControlClearance} from './useTopControlClearance';
import { useLayoutEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { PanelReadinessContext, PanelVisibilityContext, type PanelReadiness } from './PanelReadiness';
import { mobileChatLayout } from './chatPosition';

/** Real height animation; child screens fill the available space above the controls. */
export function ComposerPanel({ open, input, children, contentKey = '', extentKey = '', dragging = false, obscured = false, sideBySide = false }: { open: boolean; input: ReactNode; children: ReactNode; contentKey?: string; extentKey?: string; dragging?: boolean; obscured?: boolean; sideBySide?: boolean }) {
  const frame = useRef<HTMLDivElement>(null), inputLayer = useRef<HTMLDivElement>(null), menuLayer = useRef<HTMLDivElement>(null);
  const topClearance=useTopControlClearance(menuLayer,open&&sideBySide,`${extentKey}:${sideBySide}`);
  const animation = useRef<Animation | null>(null), initialized = useRef(false);
  const readiness = useRef<PanelReadiness>({ pending: new Set(), listeners: new Set() });
  const targetHeight = useRef(0);
  const previousPresentation = useRef({ open, contentKey, sideBySide });
  useLayoutEffect(() => {
    const node = frame.current!, input = inputLayer.current!, menu = menuLayer.current!;
    const body = menu.querySelector<HTMLElement>('.composer-view:not([hidden]) .composer-surface-body');
    const footer = menu.querySelector<HTMLElement>('.composer-view:not([hidden]) .composer-surface-footer');
    const content = body || menu.querySelector<HTMLElement>('.composer-view:not([hidden])') || menu.firstElementChild as HTMLElement;
    const prior = previousPresentation.current;
    const animatePresentation = prior.open !== open || prior.contentKey !== contentKey || prior.sideBySide !== sideBySide;
    previousPresentation.current = { open, contentKey, sideBySide };
    const resize = (target: number, animate: boolean) => {
      if (target === targetHeight.current) return;
      const previous = node.getBoundingClientRect().height;
      targetHeight.current = target; animation.current?.cancel(); node.style.height = `${target}px`;
      if (animate && initialized.current && !dragging && Math.abs(previous - target) > 1) {
        animation.current = node.animate([{ height: `${previous}px` }, { height: `${target}px` }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      initialized.current = true;
    };
    const fit = (animate = false) => {
      // Keyboard/viewport changes must not animate an old tall panel above its
      // newly raised bottom edge. Only deliberate navigation animates height.
      node.toggleAttribute('data-loading', open && readiness.current.pending.size > 0);
      const mobile = mobileChatLayout();
      if (open && !body && !mobile && initialized.current && readiness.current.pending.size) return;
      const style = getComputedStyle(menu);
      const natural = (content?.offsetHeight || 0) + (footer?.offsetHeight || 0) + parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
      const limit = parseFloat(style.maxHeight);
      const panelHeight = Math.max(76, (body || mobile) && Number.isFinite(limit) ? limit : Math.min(natural, Number.isFinite(limit) ? limit : natural));
      menu.style.height = sideBySide && open ? `${panelHeight}px` : '';
      const target = open && !sideBySide ? panelHeight : input.offsetHeight;
      if (!target || target === targetHeight.current) return;
      resize(target, animate);
    };
    if (!animatePresentation) animation.current?.cancel();
    fit(animatePresentation);
    const fitLayout = () => fit(false), fitViewport = () => { animation.current?.cancel(); fit(false); }, observer = new ResizeObserver(fitLayout);
    observer.observe(input); if (content) observer.observe(content); if (footer) observer.observe(footer);
    window.addEventListener('resize', fitViewport); window.visualViewport?.addEventListener('resize', fitViewport); readiness.current.listeners.add(fitLayout);
    return () => { observer.disconnect(); window.removeEventListener('resize', fitViewport); window.visualViewport?.removeEventListener('resize', fitViewport); readiness.current.listeners.delete(fitLayout); };
  }, [open, contentKey, extentKey, dragging, sideBySide,topClearance]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return <PanelReadinessContext.Provider value={readiness.current}><div className={`composer-switcher ${open ? 'launcher-open' : ''} ${sideBySide ? 'side-open' : ''}`} ref={frame}>
    <div ref={inputLayer} className="composer-input-layer" inert={open && !sideBySide} aria-hidden={open && !sideBySide || undefined}>{input}</div>
    <div ref={menuLayer} style={{'--panel-control-gap':`${12+topClearance}px`} as CSSProperties} className="composer-menu-layer" inert={!open} aria-hidden={!open || undefined}><PanelVisibilityContext.Provider value={open && !obscured}>{children}</PanelVisibilityContext.Provider></div>
  </div></PanelReadinessContext.Provider>;
}
