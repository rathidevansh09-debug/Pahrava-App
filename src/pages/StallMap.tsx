import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { setPrefs, useDB, useLang, useNow } from '../data/store';
import { STALL_STATUSES, type Stall, type StallStatus, type StallType } from '../data/types';
import { indexDB, stallState, type StallState } from '../domain/derive';
import { fmtCountdown, fmtRange, interpolate, money } from '../domain/format';
import { Icon } from '../components/Icon';
import { StallPanel } from '../components/StallPanel';
import { FloorPlanView, type ColourBy } from '../components/FloorPlanView';
import { EmptyState, PageHeader, Segmented } from '../components/ui';
import { useT } from '../i18n';

export function StallTile({ stall, state, dim, onClick, now, accent }: { stall: Stall; state: StallState; dim?: boolean; onClick: () => void; now: number; accent?: string }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      className={`st st-${state.status} relative flex h-[66px] w-[66px] flex-col sm:h-[76px] sm:w-[76px] items-center justify-center rounded-xl border-2 p-1 text-center transition hover:scale-[1.04] focus-visible:scale-[1.04] ${dim ? 'opacity-25' : ''}`}
      aria-label={`${t.stall.stall} ${stall.number}, ${t.status[state.status]}${state.exhibitor ? `, ${state.exhibitor.businessName}` : ''}`}
      title={state.exhibitor ? `${state.exhibitor.ownerName} · ${state.exhibitor.businessName}` : undefined}
    >
      {accent && <span className="absolute top-1 left-1 h-2.5 w-2.5 rounded-sm border border-white/60" style={{ background: accent }} aria-hidden />}
      {stall.isCorner && <span className="absolute top-0.5 right-1 text-[10px] font-semibold opacity-80" aria-hidden>◤</span>}
      <span className="tabular text-xl leading-none font-semibold">{stall.number}</span>
      <span className="mt-1 flex items-center gap-0.5 text-[11px] leading-none font-semibold">
        <Icon name={`st-${state.status}`} size={12} />
        {state.status === 'on_hold' && state.hold ? fmtCountdown(state.hold.expiresAt - now) : t.statusShort[state.status]}
      </span>
    </button>
  );
}

export function Legend() {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2" aria-label={t.map.legend}>
      {STALL_STATUSES.map((s) => (
        <span key={s} className={`st st-${s} inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold`}>
          <Icon name={`st-${s}`} size={14} /> {t.status[s]}
        </span>
      ))}
    </div>
  );
}

export function TypeLegend({ types }: { types: StallType[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((ty) => (
        <span key={ty.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
          <span className="h-3 w-3 rounded-sm" style={{ background: ty.accent ?? 'var(--border)' }} aria-hidden /> {ty.name} {ty.size}
        </span>
      ))}
    </div>
  );
}

export function StallMap() {
  const { eventId = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const db = useDB();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const idx = indexDB(db);
  const event = db.events.find((e) => e.id === eventId);
  const floors = db.floors.filter((f) => f.eventId === eventId).sort((a, b) => a.order - b.order);
  const types = db.stallTypes.filter((x) => x.eventId === eventId);

  const [floorId, setFloorId] = useState<string>(params.get('floor') ?? floors[0]?.id ?? '');
  const [typeId, setTypeId] = useState(params.get('type') ?? '');
  const [size, setSize] = useState('');
  const [status, setStatus] = useState<StallStatus | ''>((params.get('status') as StallStatus) ?? '');
  const [colourBy, setColourBy] = useState<ColourBy>('status');
  const [zoom, setZoom] = useState(1);
  const openStall = params.get('stall');
  const forId = params.get('for');
  const forEx = forId ? idx.exhibitorById.get(forId) : undefined;

  useEffect(() => {
    if (eventId) setPrefs({ eventId });
  }, [eventId]);
  useEffect(() => {
    if (!floors.some((f) => f.id === floorId)) setFloorId(floors[0]?.id ?? '');
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // If a stall is opened by link, jump to its floor.
  useEffect(() => {
    const s = openStall && idx.stallById.get(openStall);
    if (s && s.floorId !== floorId) setFloorId(s.floorId);
  }, [openStall]); // eslint-disable-line react-hooks/exhaustive-deps

  const states = useMemo(() => {
    const m = new Map<string, StallState>();
    for (const s of db.stalls) if (s.eventId === eventId) m.set(s.id, stallState(db, s.id, now));
    return m;
  }, [db, eventId, now]);

  if (!event) return <EmptyState title={t.common.noEvent} action={<Link className="btn btn-primary" to="/">{t.nav.events}</Link>} />;

  const sizes = Array.from(new Set(types.map((x) => x.size)));
  const eventStalls = db.stalls.filter((s) => s.eventId === eventId);
  const matches = (s: Stall) => {
    const ty = idx.typeById.get(s.typeId);
    return (!typeId || s.typeId === typeId) && (!size || ty?.size === size) && (!status || states.get(s.id)?.status === status);
  };
  const floorStalls = eventStalls.filter((s) => s.floorId === floorId);
  const rows = new Map<number, Stall[]>();
  for (const s of floorStalls.sort((a, b) => a.row - b.row || a.col - b.col)) rows.set(s.row, [...(rows.get(s.row) ?? []), s]);
  const matchCount = floorStalls.filter(matches).length;
  const floor = floors.find((f) => f.id === floorId);
  const freeByType = types
    .map((ty) => [ty, floorStalls.filter((s) => s.typeId === ty.id && matches(s) && states.get(s.id)?.status === 'available')] as const)
    .filter(([, list]) => list.length > 0)
    .map(([ty, list]) => [ty, [...list].sort((a, b) => Number(a.number) - Number(b.number))] as const);

  const statusCounts = Object.fromEntries(STALL_STATUSES.map((s) => [s, eventStalls.filter((x) => states.get(x.id)?.status === s && (!typeId || x.typeId === typeId)).length])) as Record<StallStatus, number>;

  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('stall', id);
    else p.delete('stall');
    setParams(p, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title={t.map.title}
        subtitle={`${event.name} · ${fmtRange(event.startDate, event.endDate, lang)}`}
        actions={
          <Link to={`/e/${eventId}/layout`} className="btn btn-sm">
            <Icon name="layout" size={16} /> {t.nav.layout}
          </Link>
        }
      />

      {forEx && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary-soft p-3 font-semibold">
          <Icon name="user" />
          <span className="flex-1">{interpolate(t.map.choosingFor, { name: `${forEx.ownerName} (${forEx.businessName})` })}</span>
          <button
            className="icon-btn"
            aria-label={t.common.clear}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.delete('for');
              setParams(p, { replace: true });
            }}
          >
            <Icon name="x" />
          </button>
        </div>
      )}

      {/* Quick answer to "which stalls of this type are free?" */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {types.map((ty) => {
          const free = eventStalls.filter((s) => s.typeId === ty.id && states.get(s.id)?.status === 'available').length;
          const on = typeId === ty.id;
          return (
            <button
              key={ty.id}
              aria-pressed={on}
              onClick={() => {
                setTypeId(on ? '' : ty.id);
                if (!on) {
                  setStatus('available');
                  const firstFloor = eventStalls.find((s) => s.typeId === ty.id)?.floorId;
                  if (firstFloor) setFloorId(firstFloor);
                } else setStatus('');
              }}
              className={`card flex min-w-[150px] shrink-0 flex-col items-start px-3 py-2 text-left ${on ? 'border-[var(--focus)] ring-1 ring-[var(--focus)]' : ''}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {ty.accent && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ty.accent }} aria-hidden />}
                {ty.name}
              </span>
              <span className="text-xs text-muted">
                {ty.size} · {money(ty.basePrice)}
              </span>
              <span className={`mt-1 text-sm font-semibold ${free ? '' : 'text-muted'}`}>{interpolate(t.map.freeOfType, { n: free })}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="-mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&>*]:shrink-0">
        <select className="input w-auto" aria-label={t.map.type} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">{t.map.allTypes}</option>
          {types.map((ty) => (
            <option key={ty.id} value={ty.id}>
              {ty.name} ({ty.size})
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label={t.map.size} value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">{t.map.allSizes}</option>
          {sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="flex gap-1.5 md:flex-wrap [&>*]:shrink-0" role="group" aria-label={t.map.status}>
          <button className="chip" aria-pressed={!status} onClick={() => setStatus('')}>
            {t.map.allStatuses}
          </button>
          {STALL_STATUSES.map((s) => (
            <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
              <Icon name={`st-${s}`} size={14} />
              {t.status[s]} <span className="tabular text-muted">{statusCounts[s]}</span>
            </button>
          ))}
        </div>
        {(typeId || size || status) && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setTypeId('');
              setSize('');
              setStatus('');
            }}
          >
            <Icon name="x" size={16} /> {t.common.clear}
          </button>
        )}
      </div>

      {/* Floor tabs + view controls */}
      <div className="mb-3 flex flex-wrap items-end gap-2 border-b border-border">
        <div role="tablist" aria-label={t.map.floor} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {floors.map((f) => {
            const free = eventStalls.filter((s) => s.floorId === f.id && matches(s) && states.get(s.id)?.status === 'available').length;
            const n = eventStalls.filter((s) => s.floorId === f.id && matches(s)).length;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={f.id === floorId}
                onClick={() => setFloorId(f.id)}
                className={`-mb-px min-h-[44px] shrink-0 border-b-4 px-3 font-semibold sm:px-4 ${f.id === floorId ? 'border-primary text-text' : 'border-transparent text-muted'}`}
              >
                {f.name} <span className="tabular text-sm font-normal text-muted">{free}/{n}</span>
              </button>
            );
          })}
        </div>
        {floor?.plan && floorStalls.length > 0 && (
          <div className="mb-1 flex items-center gap-1">
            <Segmented<ColourBy>
              label={t.plan.colourBy}
              value={colourBy}
              onChange={setColourBy}
              options={[
                { value: 'status', label: t.plan.byStatus },
                { value: 'type', label: t.plan.byType },
              ]}
            />
            <div className="ml-1 inline-flex rounded-xl bg-surface-2 p-1" role="group">
              <button className="icon-btn !min-h-[36px] !min-w-[36px]" aria-label={t.plan.zoomOut} disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
                <span className="text-xl leading-none font-semibold">−</span>
              </button>
              <button className="icon-btn !min-h-[36px] !min-w-[36px] text-xs font-semibold" aria-label={t.plan.fit} onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button className="icon-btn !min-h-[36px] !min-w-[36px]" aria-label={t.plan.zoomIn} disabled={zoom >= 3.4} onClick={() => setZoom((z) => Math.min(3.375, z * 1.5))}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {floorStalls.length === 0 ? (
        <EmptyState icon="layout" title={t.map.noStalls} hint={t.map.noStallsHint} action={<Link className="btn btn-primary" to={`/e/${eventId}/layout`}>{t.nav.layout}</Link>} />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="card p-2 sm:p-3">
            {matchCount === 0 && (
              <p className="mb-2 rounded-xl bg-surface-2 p-3 text-center font-semibold">
                {t.map.noMatch} — <span className="font-normal text-muted">{t.map.noMatchHint}</span>
              </p>
            )}
            {floor?.plan ? (
              <FloorPlanView
                floor={floor}
                stalls={floorStalls}
                states={states}
                typeById={idx.typeById}
                now={now}
                isDim={(s) => !matches(s)}
                highlightId={openStall}
                colourBy={colourBy}
                zoom={zoom}
                onSelect={setOpen}
              />
            ) : (
              <div className="space-y-3 p-1">
                <p className="text-sm text-muted">{t.plan.noDrawing}</p>
                {[...rows.entries()].map(([r, list]) => (
                  <div key={r} className="flex flex-wrap gap-1.5 sm:gap-2">
                    {list.map((s) => (
                      <StallTile key={s.id} stall={s} state={states.get(s.id)!} now={now} dim={!matches(s)} accent={idx.typeById.get(s.typeId)?.accent} onClick={() => setOpen(s.id)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 border-t border-border px-1 pt-3">
              {colourBy === 'type' && floor?.plan ? (
                <TypeLegend types={types.filter((ty) => floorStalls.some((s) => s.typeId === ty.id))} />
              ) : (
                <Legend />
              )}
              <p className="mt-2 text-sm text-muted">
                {t.plan.tapHint}
                {floorStalls.some((s) => s.isCorner) && <> · ◥ = {t.map.corner}</>}
              </p>
            </div>
          </div>

          {/* Free stalls on this floor, grouped by type — quick answer during a call */}
          <aside className="card p-4">
            <h2 className="mb-2 font-semibold">{interpolate(t.plan.freeOnFloor, { floor: floor?.name ?? '' })}</h2>
            {freeByType.length === 0 ? (
              <p className="text-muted">{t.plan.noFree}</p>
            ) : (
              <div className="space-y-3">
                {freeByType.map(([ty, list]) => (
                  <div key={ty.id}>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      {ty.accent && <span className="h-3 w-3 rounded-sm" style={{ background: ty.accent }} aria-hidden />}
                      {ty.name} {ty.size} · {money(ty.basePrice)} <span className="text-muted">({list.length})</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((s) => (
                        <button key={s.id} className="st st-available tabular min-h-[40px] min-w-[44px] rounded-lg border px-2 text-sm font-semibold" onClick={() => setOpen(s.id)}>
                          {s.number}
                          {s.isCorner && <span className="ml-0.5 text-[10px] opacity-70">◥</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {openStall && idx.stallById.get(openStall)?.eventId === eventId && <StallPanel key={openStall} stallId={openStall} preselectId={forId ?? undefined} onClose={() => setOpen(null)} />}
    </div>
  );
}
