import { useId } from 'react';
import { countActiveFilters, DEFAULT_FILTERS, type Filters } from '../lib/filters.ts';

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  showAllTrails: boolean;
  onShowAllTrailsChange: (show: boolean) => void;
}

const parseOptionalNumber = (value: string): number | null => {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function NumberField({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(parseOptionalNumber(e.target.value))}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function FilterPanel({ filters, onChange, showAllTrails, onShowAllTrailsChange }: Props) {
  const searchId = useId();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const active = countActiveFilters(filters);

  return (
    <section className="panel filters" aria-label="Filters">
      <div className="field">
        <label htmlFor={searchId}>Search</label>
        <input
          id={searchId}
          type="search"
          placeholder="Callsign, hex, reg or type"
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="field-row">
        <NumberField label="Min altitude (ft)" value={filters.minAltitudeFt} onChange={(v) => set('minAltitudeFt', v)} step={1000} placeholder="0" />
        <NumberField label="Max altitude (ft)" value={filters.maxAltitudeFt} onChange={(v) => set('maxAltitudeFt', v)} step={1000} placeholder="Any" />
        <NumberField label="Min speed (kt)" value={filters.minSpeedKt} onChange={(v) => set('minSpeedKt', v)} step={50} placeholder="0" />
      </div>
      <div className="toggles">
        <Toggle label="Hide on ground" checked={filters.hideOnGround} onChange={(v) => set('hideOnGround', v)} />
        <Toggle label="Military only" checked={filters.militaryOnly} onChange={(v) => set('militaryOnly', v)} />
        <Toggle label="Emergencies only" checked={filters.emergencyOnly} onChange={(v) => set('emergencyOnly', v)} />
        <Toggle label="Show all trails" checked={showAllTrails} onChange={onShowAllTrailsChange} />
      </div>
      {active > 0 && (
        <button type="button" className="link-button" onClick={() => onChange(DEFAULT_FILTERS)}>
          Clear {active} filter{active === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}
