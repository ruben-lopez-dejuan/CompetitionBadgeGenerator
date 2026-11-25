import { useState } from "react";
import { CopyPlus, Eye, EyeOff, Plus, Printer, Trash2, Upload } from "lucide-react";
import { MAX_EXTRA_COUNT } from "../extraBadges.js";

const inputClass = "w-full text-sm px-2 py-1.5 border border-neutral-300 rounded-md";

function BackgroundPicker({ label, value, onChange }) {
  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center justify-center w-10 h-10 border border-neutral-300 rounded cursor-pointer hover:bg-neutral-50 overflow-hidden shrink-0" title={`Upload the ${label.toLowerCase()} background`}>
        {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <Upload size={14} className="text-neutral-400" />}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" aria-label={`${label} background`} className="hidden" onChange={onFile} />
      </label>
      <div className="flex-1 min-w-0 text-xs">
        <div>{label}</div>
        <div className="text-[10px] text-neutral-400">{value ? "Own background" : "Same as the template"}</div>
      </div>
      {value && (
        <button onClick={() => onChange(null)} className="text-neutral-400 hover:text-red-500" title="Back to the template's background">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ElementList({ label, fields, fieldName, hidden, onChange }) {
  if (fields.length === 0) return null;
  const ids = fields.map((f) => f.id);
  const without = [...hidden].filter((id) => !ids.includes(id));
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] mb-0.5">
        <span className="flex-1 text-neutral-500">{label}</span>
        <button onClick={() => onChange(without)} className="text-blue-600 hover:underline">All</button>
        <button onClick={() => onChange([...without, ...ids])} className="text-blue-600 hover:underline">None</button>
      </div>
      {fields.map((f) => (
        <label key={f.id} className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input type="checkbox" checked={!hidden.has(f.id)} onChange={(e) => onChange(e.target.checked ? [...hidden].filter((id) => id !== f.id) : [...hidden, f.id])} />
          <span className="truncate">{fieldName(f)}</span>
        </label>
      ))}
    </div>
  );
}

// Left-panel tab for the groups of badges that aren't for anyone in the
// WCIF (see extraBadges.js).
export default function ExtraBadgesPanel({ groups, frontFields, backFields, fieldName, previewId, onPreview, inMainPdf, onInMainPdfChange, onAdd, onUpdate, onDuplicate, onRemove, onGenerate, generating }) {
  const [elementsOpen, setElementsOpen] = useState({});
  const total = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="p-4 space-y-4">
      <div className="text-[11px] text-neutral-400">
        Badges that aren't for anyone in the competition, such as sponsors or guests. Each group uses this template with its own backgrounds and texts. They're saved with the template.
      </div>

      {groups.map((g) => {
        const hidden = new Set(g.hiddenFieldIds);
        const previewing = previewId === g.id;
        const update = (patch) => onUpdate(g.id, patch);
        return (
          <div key={g.id} data-extra-group className={`border rounded-lg p-3 space-y-3 ${previewing ? "border-blue-400 ring-1 ring-blue-200" : "border-neutral-200"}`}>
            <div className="flex items-center gap-1.5">
              <input aria-label="Group name" value={g.title} onChange={(e) => update({ title: e.target.value })} placeholder="Group name" className="flex-1 min-w-0 text-sm font-medium px-2 py-1 border border-transparent hover:border-neutral-300 rounded-md" />
              <button onClick={() => onPreview(previewing ? null : g.id)} className={previewing ? "text-blue-600" : "text-neutral-400 hover:text-neutral-700"} title={previewing ? "Stop previewing" : "Preview on the badge"}>
                {previewing ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button onClick={() => onDuplicate(g.id)} className="text-neutral-400 hover:text-neutral-700" title="Duplicate group">
                <CopyPlus size={15} />
              </button>
              <button onClick={() => onRemove(g.id)} className="text-neutral-400 hover:text-red-500" title="Delete group">
                <Trash2 size={14} />
              </button>
            </div>

            <div className="flex gap-2">
              <label className="w-20 shrink-0">
                <div className="text-[11px] text-neutral-500 mb-1">Badges</div>
                <input
                  type="number"
                  min={0}
                  max={MAX_EXTRA_COUNT}
                  value={g.count}
                  onChange={(e) => update({ count: Math.min(MAX_EXTRA_COUNT, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
                  className={inputClass}
                />
              </label>
              <label className="flex-1 min-w-0">
                <div className="text-[11px] text-neutral-500 mb-1">Role value</div>
                <input value={g.role} onChange={(e) => update({ role: e.target.value })} placeholder="e.g. sponsor" className={inputClass} />
              </label>
            </div>

            <label className="block">
              <div className="text-[11px] text-neutral-500 mb-1">Names, one per line</div>
              <textarea value={g.names} onChange={(e) => update({ names: e.target.value })} rows={2} placeholder="Blank to write them by hand" className={`${inputClass} resize-y`} />
              <div className="text-[10px] text-neutral-400">A single name goes on every badge of the group.</div>
            </label>

            <BackgroundPicker label="Front" value={g.front} onChange={(front) => update({ front })} />
            <BackgroundPicker label="Back" value={g.back} onChange={(back) => update({ back })} />

            <button onClick={() => setElementsOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} className="text-[11px] text-blue-600 hover:underline">
              {elementsOpen[g.id] ? "Hide elements" : "Choose elements to print"}
            </button>
            {elementsOpen[g.id] && (
              <div className="space-y-2">
                <ElementList label="Front" fields={frontFields} fieldName={fieldName} hidden={hidden} onChange={(hiddenFieldIds) => update({ hiddenFieldIds })} />
                <ElementList label="Back" fields={backFields} fieldName={fieldName} hidden={hidden} onChange={(hiddenFieldIds) => update({ hiddenFieldIds })} />
              </div>
            )}

            <button
              onClick={() => onGenerate([g])}
              disabled={generating || g.count === 0}
              className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
            >
              <Printer size={13} /> PDF of this group
            </button>
          </div>
        );
      })}

      <button onClick={onAdd} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
        <Plus size={11} /> Add group
      </button>

      {groups.length > 0 && (
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={inMainPdf} onChange={(e) => onInMainPdfChange(e.target.checked)} />
            Add them at the end of the main PDF
          </label>
          <button
            onClick={() => onGenerate(groups)}
            disabled={generating || total === 0}
            className="w-full flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Printer size={14} /> PDF of all {total} extra badges
          </button>
        </div>
      )}
    </div>
  );
}
