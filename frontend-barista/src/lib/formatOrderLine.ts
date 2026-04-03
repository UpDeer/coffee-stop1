export type ParamDisplay = {
  key: string;
  label: string;
  value: unknown;
  unit?: string | null;
};

export type LineForFormat = {
  quantity: number;
  name: string;
  item_params_display?: ParamDisplay[] | null;
  modifiers?: Array<{ name: string }> | null;
};

export function formatParamSegment(p: ParamDisplay): string {
  const val = String(p.value ?? "").trim();
  if (!val) return "";
  const unit = p.unit?.trim() ? ` ${p.unit.trim()}` : "";
  const lab = (p.label || "").trim();

  if (lab === val) {
    return `${val}${unit}`;
  }
  if (/^\d+$/.test(lab) && lab === val) {
    return `${val}${unit}`;
  }
  if (lab) {
    return `${lab} ${val}${unit}`.trim();
  }
  return `${val}${unit}`;
}

function uniqSegments(segments: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of segments) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function formatOrderLineSummary(line: LineForFormat): string {
  const qty = line.quantity;
  const name = line.name;
  const paramParts = uniqSegments(
    (line.item_params_display ?? []).map((p) => formatParamSegment(p)).filter(Boolean)
  );
  const modParts = uniqSegments((line.modifiers ?? []).map((m) => (m.name || "").trim()).filter(Boolean));

  const tail = [...paramParts, ...modParts];
  if (!tail.length) {
    return `${qty}× ${name}`;
  }
  return `${qty}× ${name}, ${tail.join(", ")}`;
}
