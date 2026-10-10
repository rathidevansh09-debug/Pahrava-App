import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Floor, PlanFeature, Stall, StallStatus, StallType } from '../data/types';
import type { StallState } from '../domain/derive';
import { fmtCountdown, interpolate } from '../domain/format';
import { useT, type Dict } from '../i18n';
import { FILLED, PATHS } from './Icon';

export type ColourBy = 'status' | 'type';

const ST_VAR: Record<StallStatus, string> = {
  available: 'available',
  on_hold: 'hold',
  booked_unpaid: 'booked',
  partly_paid: 'partly',
  fully_paid: 'paid',
};

interface Props {
  floor: Floor;
  stalls: Stall[];
  states: Map<string, StallState>;
  typeById: Map<string, StallType>;
  now: number;
  onSelect?: (stallId: string) => void;
  isDim?: (s: Stall) => boolean;
  highlightId?: string | null;
  colourBy?: ColourBy;
  /** 1 = fit to screen; >1 zooms in and the plan becomes scrollable. */
  zoom?: number;
  compact?: boolean;
  /** Label override (e.g. stall code) */
  label?: (s: Stall) => string;
}

/**
 * Draws the architect's floor plan (hall outline, stages, passages, entry/exit)
 * with every stall coloured live by status or by stall type.
 */
export function FloorPlanView({ floor, stalls, states, typeById, now, onSelect, isDim, highlightId, colourBy = 'status', zoom = 1, compact = false }: Props) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [vx, vy, vw, vh] = floor.plan!.viewBox;
  const u = vw / 60; // a "unit" for text and arrow sizes that scales with the plan

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: window.innerHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const availH = compact ? 420 : Math.max(380, box.h - 250);
  // Fit to width, but don't shrink a tall hall below ~72% of the width fit just to avoid scrolling:
  // readable stall numbers matter more than seeing the whole hall at once.
  const fitW = box.w / vw;
  const fitH = availH / vh;
  const fit = box.w ? Math.min(fitW, compact ? fitH : Math.max(fitH, fitW * 0.72), 2.6) : 1;
  const scale = fit * zoom;
  const pxW = Math.round(vw * scale);
  const pxH = Math.round(vh * scale);

  // Keep the highlighted stall in view when zoomed in.
  useEffect(() => {
    if (!highlightId || zoom <= 1 || !wrap.current) return;
    const s = stalls.find((x) => x.id === highlightId);
    if (!s?.pos) return;
    wrap.current.scrollTo({ left: (s.pos.x - vx) * scale - box.w / 2, top: (s.pos.y - vy) * scale - availH / 2, behavior: 'smooth' });
  }, [highlightId, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="w-full overflow-auto overscroll-contain" style={{ maxHeight: zoom > 1 ? availH : undefined }}>
      {box.w > 0 && (
        <svg
          width={pxW}
          height={pxH}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="mx-auto block select-none"
          role="group"
          aria-label={floor.name}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <defs>
            <marker id="pl-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--muted)" />
            </marker>
            <pattern id="pl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border)" strokeWidth="2" />
            </pattern>
          </defs>
          {floor.plan!.features.map((f, i) => (
            <Feature key={i} f={f} u={u} t={t} compact={compact} />
          ))}
          {stalls
            .filter((s) => s.pos)
            .map((s) => (
              <StallShape
                key={s.id}
                s={s}
                st={states.get(s.id)}
                type={typeById.get(s.typeId)}
                now={now}
                t={t}
                colourBy={colourBy}
                dim={isDim?.(s) ?? false}
                highlight={s.id === highlightId}
                compact={compact}
                onSelect={onSelect}
              />
            ))}
        </svg>
      )}
    </div>
  );
}

function Feature({ f, u, t, compact }: { f: PlanFeature; u: number; t: Dict; compact: boolean }) {
  const label = (key: string | undefined) => (key ? ((t.plan as Record<string, string>)[key] ?? key) : '');
  const text = { fill: 'var(--muted)', fontWeight: 600, textAnchor: 'middle' as const, dominantBaseline: 'central' as const };
  switch (f.kind) {
    case 'hall':
      return <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="var(--surface)" stroke="var(--muted)" strokeWidth={2} vectorEffect="non-scaling-stroke" rx={u * 0.3} />;
    case 'stage':
    case 'room': {
      const fs = Math.min(f.h! * 0.28, f.w! * 0.16, u * 1.4);
      return (
        <g>
          <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="var(--surface-2)" stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" rx={u * 0.2} />
          <text x={f.x + f.w! / 2} y={f.y + f.h! / 2 - (f.note && !compact ? fs * 0.55 : 0)} fontSize={fs} {...text}>
            {f.kind === 'stage' ? t.plan.stage : label(f.label ?? 'room')}
          </text>
          {f.note && !compact && (
            <text x={f.x + f.w! / 2} y={f.y + f.h! / 2 + fs * 0.75} fontSize={fs * 0.7} {...text} fontWeight={400}>
              {f.note}
            </text>
          )}
        </g>
      );
    }
    case 'stairs':
      return (
        <g>
          <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="url(#pl-hatch)" stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {!compact && f.h! > u && (
            <text x={f.x + f.w! / 2} y={f.y + f.h! / 2} fontSize={Math.min(u * 0.9, f.h! * 0.4)} {...text}>
              {t.plan.stairs}
            </text>
          )}
        </g>
      );
    case 'passage': {
      const vertical = Math.abs(f.x2! - f.x) < Math.abs(f.y2! - f.y);
      const mx = (f.x + f.x2!) / 2;
      const my = (f.y + f.y2!) / 2;
      return (
        <g opacity={0.8}>
          <line x1={f.x} y1={f.y} x2={f.x2} y2={f.y2} stroke="var(--muted)" strokeDasharray="6 5" strokeWidth={1.2} vectorEffect="non-scaling-stroke" markerStart="url(#pl-arrow)" markerEnd="url(#pl-arrow)" />
          {!compact && (
            <g transform={vertical ? `rotate(-90 ${mx} ${my})` : undefined}>
              <rect x={mx - u * 4.2} y={my - u * 0.75} width={u * 8.4} height={u * 1.5} fill="var(--surface)" rx={u * 0.3} />
              <text x={mx} y={my} fontSize={u * 0.95} {...text}>
                {interpolate(t.plan.passage, { w: f.note ?? '' })}
              </text>
            </g>
          )}
        </g>
      );
    }
    case 'entry':
    case 'exit': {
      const L = u * 2.6;
      const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f.dir ?? 'up'];
      const x2 = f.x + d[0] * L;
      const y2 = f.y + d[1] * L;
      const colour = f.kind === 'entry' ? 'var(--primary)' : 'var(--muted)';
      // Horizontal arrows: label above the arrow. Vertical arrows: label beside it.
      const lx = d[0] ? (f.x + x2) / 2 : f.x + u * 0.7;
      const ly = d[0] ? f.y - u * 1.1 : (f.y + y2) / 2;
      return (
        <g>
          <line x1={f.x} y1={f.y} x2={x2} y2={y2} stroke={colour} strokeWidth={u * 0.35} markerEnd="url(#pl-arrow)" />
          <text x={lx} y={ly} fontSize={u * 1.05} fill={colour} fontWeight={700} textAnchor={d[0] ? 'middle' : 'start'} dominantBaseline="central">
            {f.kind === 'entry' ? t.plan.entry : t.plan.exit}
          </text>
        </g>
      );
    }
    case 'label':
      return compact ? null : (
        <text x={f.x} y={f.y} fontSize={u * 1.05} {...text}>
          {label(f.label)}
        </text>
      );
  }
}

function StallShape({
  s,
  st,
  type,
  now,
  t,
  colourBy,
  dim,
  highlight,
  compact,
  onSelect,
}: {
  s: Stall;
  st?: StallState;
  type?: StallType;
  now: number;
  t: Dict;
  colourBy: ColourBy;
  dim: boolean;
  highlight: boolean;
  compact: boolean;
  onSelect?: (id: string) => void;
}) {
  const { x, y, w, h } = s.pos!;
  const status = st?.status ?? 'available';
  const v = ST_VAR[status];
  const byType = colourBy === 'type' && type?.accent;
  const fill = byType ? type!.accent! : `var(--st-${v}-bg)`;
  const stroke = byType ? 'rgba(0,0,0,.35)' : `var(--st-${v}-border)`;
  const ink = byType ? '#fff' : `var(--st-${v}-text)`;
  const m = Math.min(w, h);
  const fs = Math.max(7, Math.min(m * 0.42, 26));
  const two = !compact && h >= fs * 2.3 && w >= fs * 1.6;
  const sub = status === 'on_hold' && st?.hold ? fmtCountdown(st.hold.expiresAt - now) : t.statusShort[status];
  // Second line (icon + text) must fit inside the stall width.
  const fs2 = Math.min(fs * 0.55, (w * 0.86) / (sub.length * 0.56 + 1.5));
  const iconK = (two ? fs2 * 1.15 : Math.min(m * 0.3, 10)) / 24;
  const pad = m * 0.06;

  const title = `#${s.number} · ${type?.name ?? ''} ${type?.size ?? ''} · ${t.status[status]}${st?.exhibitor ? ` · ${st.exhibitor.ownerName} (${st.exhibitor.businessName})` : ''}${s.isCorner ? ` · ${t.map.corner}` : ''}`;

  return (
    <g
      className={`plan-stall ${onSelect ? 'cursor-pointer' : ''}`}
      opacity={dim ? 0.22 : 1}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={title}
      onClick={() => onSelect?.(s.id)}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(s.id);
        }
      }}
    >
      <title>{title}</title>
      <rect className="plan-box" x={x + 0.8} y={y + 0.8} width={w - 1.6} height={h - 1.6} rx={m * 0.08} fill={fill} stroke={highlight ? 'var(--primary)' : stroke} strokeWidth={highlight ? 4 : 1.5} vectorEffect="non-scaling-stroke" />
      {/* Type stripe when colouring by status (never used to show status) */}
      {!byType && type?.accent && <rect x={x + 0.8} y={y + 0.8} width={w - 1.6} height={Math.max(2, h * 0.09)} rx={m * 0.05} fill={type.accent} pointerEvents="none" />}
      {s.isCorner && <path d={`M${x + w - 0.8} ${y + 0.8} l${-m * 0.28} 0 l${m * 0.28} ${m * 0.28}z`} fill={ink} opacity={0.55} pointerEvents="none" />}
      <text x={x + w / 2} y={two ? y + h * 0.42 : y + h / 2 + (byType ? 0 : h * 0.04)} fontSize={fs} fontWeight={700} fill={ink} textAnchor="middle" dominantBaseline="central" pointerEvents="none" className="tabular" stroke={byType ? 'rgba(0,0,0,.35)' : undefined} strokeWidth={byType ? fs * 0.08 : undefined} style={{ paintOrder: 'stroke' }}>
        {s.number}
      </text>
      {/* Status icon (+ short label when there is room) so colour is never the only signal */}
      <StatusGlyph
        status={status}
        k={iconK}
        x={two ? x + w / 2 - (sub.length * fs2 * 0.27 + iconK * 13) : x + pad}
        y={two ? y + h * 0.76 - iconK * 12 : y + h - pad - iconK * 24}
        colour={ink}
        badge={!!byType}
      />
      {two && (
        <text x={x + w / 2 + iconK * 13} y={y + h * 0.76} fontSize={fs2} fontWeight={600} fill={ink} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
          {sub}
        </text>
      )}
    </g>
  );
}

function StatusGlyph({ status, k, x, y, colour, badge }: { status: StallStatus; k: number; x: number; y: number; colour: string; badge: boolean }) {
  const name = `st-${status}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} pointerEvents="none">
      {badge && <circle cx={12} cy={12} r={11} fill={`var(--st-${ST_VAR[status]}-bg)`} stroke={`var(--st-${ST_VAR[status]}-border)`} strokeWidth={2} />}
      {FILLED[name] && <path d={FILLED[name]} fill={badge ? `var(--st-${ST_VAR[status]}-text)` : colour} opacity={status === 'booked_unpaid' ? 0.3 : 1} />}
      <path d={PATHS[name]} fill="none" stroke={badge ? `var(--st-${ST_VAR[status]}-text)` : colour} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
