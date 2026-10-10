import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { exec, setPrefs, useDB, useNow } from '../data/store';
import type { Stall } from '../data/types';
import { indexDB, stallState } from '../domain/derive';
import { addFloor, addPlanStall, addRow, addStallToRow, deleteFloor, moveStall, removeStall, renameFloor, updateStall } from '../domain/events';
import { interpolate, money } from '../domain/format';
import { Icon } from '../components/Icon';
import { ConfirmDialog, EmptyState, Field, Modal, PageHeader, toast } from '../components/ui';
import { useT } from '../i18n';
import { FloorPlanView } from '../components/FloorPlanView';
import { TypeLegend } from './StallMap';

export function LayoutEditor() {
  const { eventId = '' } = useParams();
  const t = useT();
  const db = useDB();
  const now = useNow();
  useEffect(() => {
    if (eventId) setPrefs({ eventId });
  }, [eventId]);
  const event = db.events.find((e) => e.id === eventId);
  const floors = db.floors.filter((f) => f.eventId === eventId).sort((a, b) => a.order - b.order);
  const types = db.stallTypes.filter((x) => x.eventId === eventId);
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [editing, setEditing] = useState<string>();
  const [rowForm, setRowForm] = useState(false);
  const [floorForm, setFloorForm] = useState<'add' | 'rename' | null>(null);
  const [deletingFloor, setDeletingFloor] = useState(false);
  useEffect(() => {
    if (!floors.some((f) => f.id === floorId)) setFloorId(floors[0]?.id ?? '');
  }, [floors, floorId]);

  if (!event) return <EmptyState title={t.common.noEvent} action={<Link className="btn btn-primary" to="/">{t.nav.events}</Link>} />;
  const idx = indexDB(db);
  const floor = floors.find((f) => f.id === floorId);
  const stalls = db.stalls.filter((s) => s.floorId === floorId).sort((a, b) => a.row - b.row || a.col - b.col);
  const rows = Array.from(new Set(stalls.map((s) => s.row)));
  const nextNumber = Math.max(0, ...stalls.map((s) => Number(s.number) || 0)) + 1;
  const states = new Map(stalls.map((s) => [s.id, stallState(db, s.id, now)]));

  const addOnPlan = () => {
    if (!types[0]) return toast(t.layout.noTypes, 'error');
    const r = exec((d, n) => addPlanStall(d, floorId, types[0].id, String(nextNumber), n));
    if (r.ok) setEditing(r.stall.id);
  };

  const quickAdd = (row: number) => {
    const typeId = stalls.filter((s) => s.row === row).at(-1)?.typeId ?? types[0]?.id;
    if (!typeId) return toast(t.layout.noTypes, 'error');
    const r = exec((d, n) => addStallToRow(d, floorId, row, typeId, String(nextNumber), n));
    if (!r.ok) toast(interpolate(t.layout.duplicateNumber, { n: nextNumber }), 'error');
  };

  return (
    <div>
      <PageHeader
        title={t.layout.title}
        subtitle={event.name}
        actions={
          <Link to={`/e/${eventId}/map`} className="btn btn-sm">
            <Icon name="grid" size={16} /> {t.nav.map}
          </Link>
        }
      />
      <p className="mb-4 text-muted">{t.layout.intro}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border">
        <div role="tablist" className="flex gap-1 overflow-x-auto">
          {floors.map((f) => (
            <button key={f.id} role="tab" aria-selected={f.id === floorId} onClick={() => setFloorId(f.id)} className={`-mb-px min-h-[44px] border-b-4 px-4 font-semibold ${f.id === floorId ? 'border-primary' : 'border-transparent text-muted'}`}>
              {f.name}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setFloorForm('add')}>
          <Icon name="plus" size={16} /> {t.layout.addFloor}
        </button>
      </div>

      {floor && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button className="btn btn-sm" onClick={() => setFloorForm('rename')}>
            <Icon name="edit" size={16} /> {t.layout.renameFloor}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => (stalls.length ? toast(t.layout.floorNotEmpty, 'error') : setDeletingFloor(true))}>
            <Icon name="trash" size={16} /> {t.layout.deleteFloor}
          </button>
          {floor.plan ? (
            <button className="btn btn-sm btn-primary ml-auto" onClick={addOnPlan}>
              <Icon name="plus" size={16} /> {t.layout.addStall}
            </button>
          ) : (
            <button className="btn btn-sm btn-primary ml-auto" onClick={() => (types.length ? setRowForm(true) : toast(t.layout.noTypes, 'error'))}>
              <Icon name="plus" size={16} /> {t.layout.addRow}
            </button>
          )}
        </div>
      )}

      {!floor ? (
        <EmptyState icon="layout" title={t.map.noStalls} action={<button className="btn btn-primary" onClick={() => setFloorForm('add')}>{t.layout.addFloor}</button>} />
      ) : floor.plan ? (
        <div className="card p-3">
          <FloorPlanView floor={floor} stalls={stalls} states={states} typeById={idx.typeById} now={now} colourBy="type" highlightId={editing} onSelect={setEditing} />
          <div className="mt-3 border-t border-border pt-3">
            <TypeLegend types={types} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="layout" title={t.map.noStalls} hint={t.map.noStallsHint} action={<button className="btn btn-primary" onClick={() => setRowForm(true)}>{t.layout.addRow}</button>} />
      ) : (
        <div className="card space-y-3 p-3">
          {rows.map((r, i) => (
            <div key={r} className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-sm font-semibold text-muted">{interpolate(t.layout.rowOf, { n: i + 1 })}</span>
              {stalls
                .filter((s) => s.row === r)
                .map((s) => {
                  const ty = idx.typeById.get(s.typeId);
                  return (
                    <button key={s.id} onClick={() => setEditing(s.id)} className="relative flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 border-border bg-surface-2 hover:border-primary">
                      {ty?.accent && <span className="absolute top-1 left-1 h-2.5 w-2.5 rounded-sm" style={{ background: ty.accent }} aria-hidden />}
                      {s.isCorner && <span className="absolute top-0.5 right-1 text-[10px]">◤</span>}
                      <span className="tabular font-semibold">{s.number}</span>
                      <span className="max-w-full truncate px-1 text-[10px] text-muted">{ty?.size}</span>
                    </button>
                  );
                })}
              <button className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted hover:border-primary" aria-label={`${t.layout.addStall} (${interpolate(t.layout.rowOf, { n: i + 1 })})`} onClick={() => quickAdd(r)}>
                <Icon name="plus" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 border-t border-border pt-3 text-sm text-muted">
            {types.map((ty) => (
              <span key={ty.id} className="inline-flex items-center gap-1">
                {ty.accent && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ty.accent }} />}
                {ty.name} {ty.size} · {money(ty.basePrice)} ({db.stalls.filter((s) => s.typeId === ty.id).length})
              </span>
            ))}
          </div>
        </div>
      )}

      {editing && idx.stallById.get(editing) && <StallEditor stall={idx.stallById.get(editing)!} onClose={() => setEditing(undefined)} />}
      {rowForm && floor && <RowForm floorId={floor.id} eventId={eventId} nextNumber={nextNumber} onClose={() => setRowForm(false)} />}
      {floorForm && (
        <FloorForm
          initial={floorForm === 'rename' ? floor?.name ?? '' : ''}
          title={floorForm === 'add' ? t.layout.addFloor : t.layout.renameFloor}
          onClose={() => setFloorForm(null)}
          onSave={(name) => {
            if (floorForm === 'add') {
              const f = exec((d, n) => addFloor(d, eventId, name, n));
              setFloorId(f.id);
            } else exec((d) => renameFloor(d, floorId, name));
            setFloorForm(null);
          }}
        />
      )}
      {deletingFloor && floor && (
        <ConfirmDialog title={`${t.layout.deleteFloor}: ${floor.name}?`} body={<p>{floor.name}</p>} confirmLabel={t.common.delete} onClose={() => setDeletingFloor(false)} onConfirm={() => exec((d) => deleteFloor(d, floor.id))} />
      )}
    </div>
  );
}

function FloorForm({ initial, title, onSave, onClose }: { initial: string; title: string; onSave: (n: string) => void; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(initial);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onSave(name)}>
            {t.common.save}
          </button>
        </>
      }
    >
      <Field label={t.layout.floorName}>
        <input className="input" data-autofocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name)} />
      </Field>
    </Modal>
  );
}

function RowForm({ floorId, eventId, nextNumber, onClose }: { floorId: string; eventId: string; nextNumber: number; onClose: () => void }) {
  const t = useT();
  const db = useDB();
  const types = db.stallTypes.filter((x) => x.eventId === eventId);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [count, setCount] = useState(10);
  const [start, setStart] = useState(nextNumber);
  const [err, setErr] = useState<string>();
  const save = () => {
    const r = exec((d, n) => addRow(d, floorId, typeId, count, start, n));
    if (!r.ok) return setErr(interpolate(t.layout.duplicateNumber, { n: `${start}–${start + count - 1}` }));
    onClose();
  };
  return (
    <Modal
      title={t.layout.addRow}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={!typeId || count < 1} onClick={save}>
            <Icon name="plus" size={18} /> {t.layout.addRow}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t.layout.stallType}>
          <select className="input" data-autofocus value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} {x.size} · {money(x.basePrice)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.layout.count}>
            <input className="input tabular" type="number" min={1} max={40} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
          </Field>
          <Field label={t.layout.startNumber} error={err}>
            <input className="input tabular" type="number" min={1} value={start} onChange={(e) => { setStart(Number(e.target.value) || 1); setErr(undefined); }} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function StallEditor({ stall, onClose }: { stall: Stall; onClose: () => void }) {
  const t = useT();
  const db = useDB();
  const now = useNow();
  const types = db.stallTypes.filter((x) => x.eventId === stall.eventId);
  const [number, setNumber] = useState(stall.number);
  const [typeId, setTypeId] = useState(stall.typeId);
  const [corner, setCorner] = useState(stall.isCorner);
  const [price, setPrice] = useState(stall.priceOverride !== undefined ? String(stall.priceOverride) : '');
  const [pos, setPos] = useState(stall.pos);
  const setP = (k: 'x' | 'y' | 'w' | 'h', v: number) => setPos((p) => (p ? { ...p, [k]: Math.round(v * 10) / 10 } : p));
  // Live-preview position changes on the plan.
  const nudge = (dx: number, dy: number) => {
    if (!pos) return;
    const next = { ...pos, x: pos.x + dx, y: pos.y + dy };
    setPos(next);
    exec((d, n) => updateStall(d, stall.id, { pos: next }, n));
  };
  const step = pos ? Math.max(1, Math.round(Math.min(pos.w, pos.h) / 6)) : 1;
  const [err, setErr] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const claimed = stallState(db, stall.id, now).status !== 'available';

  const save = () => {
    const r = exec((d, n) => updateStall(d, stall.id, { number, typeId, isCorner: corner, priceOverride: price ? Number(price) : undefined, ...(pos ? { pos } : {}) }, n));
    if (!r.ok) return setErr(interpolate(t.layout.duplicateNumber, { n: number }));
    onClose();
  };

  return (
    <Modal
      title={`${t.stall.stall} #${stall.number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger mr-auto" onClick={() => (claimed ? toast(t.layout.claimed, 'error') : setRemoving(true))}>
            <Icon name="trash" size={16} /> {t.layout.remove}
          </button>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" onClick={save}>
            {t.common.save}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.layout.number} error={err}>
            <input className="input tabular" data-autofocus value={number} onChange={(e) => { setNumber(e.target.value); setErr(undefined); }} />
          </Field>
          <Field label={t.layout.stallType}>
            <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} {x.size}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={corner} onChange={(e) => setCorner(e.target.checked)} />
          {t.layout.corner}
        </label>
        <Field label={t.layout.priceOverride} hint={t.layout.priceOverrideHint}>
          <input className="input tabular" inputMode="numeric" value={price} placeholder={money(types.find((x) => x.id === typeId)?.basePrice ?? 0)} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </Field>
        {pos ? (
          <fieldset className="space-y-2 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-muted">{t.plan.position}</legend>
            <div className="grid grid-cols-4 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <Field key={k} label={{ x: t.plan.posX, y: t.plan.posY, w: t.plan.posW, h: t.plan.posH }[k]}>
                  <input className="input tabular px-2" inputMode="decimal" value={pos[k]} onChange={(e) => setP(k, Number(e.target.value) || 0)} />
                </Field>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1" role="group" aria-label={t.plan.nudge}>
              <button className="btn btn-sm" aria-label={`${t.plan.nudge} ←`} onClick={() => nudge(-step, 0)}>←</button>
              <button className="btn btn-sm" aria-label={`${t.plan.nudge} ↑`} onClick={() => nudge(0, -step)}>↑</button>
              <button className="btn btn-sm" aria-label={`${t.plan.nudge} ↓`} onClick={() => nudge(0, step)}>↓</button>
              <button className="btn btn-sm" aria-label={`${t.plan.nudge} →`} onClick={() => nudge(step, 0)}>→</button>
            </div>
          </fieldset>
        ) : (
        <div className="flex gap-2">
          <button className="btn btn-sm flex-1" onClick={() => exec((d) => moveStall(d, stall.id, -1))}>
            <Icon name="chevronLeft" size={16} /> {t.layout.moveLeft}
          </button>
          <button className="btn btn-sm flex-1" onClick={() => exec((d) => moveStall(d, stall.id, 1))}>
            {t.layout.moveRight} <Icon name="chevronRight" size={16} />
          </button>
        </div>
        )}
      </div>
      {removing && (
        <ConfirmDialog
          title={interpolate(t.layout.removeTitle, { n: stall.number })}
          body={<p>{t.layout.removeBody}</p>}
          confirmLabel={t.layout.remove}
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            const r = exec((d, n) => removeStall(d, stall.id, n));
            if (!r.ok) return toast(t.layout.claimed, 'error');
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
