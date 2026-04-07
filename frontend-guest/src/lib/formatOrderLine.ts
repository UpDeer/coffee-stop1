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

/** Одна часть параметра без «label: value», если label дублирует значение (напр. 300: 300 → 300 мл). */
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

function lineSignature(line: Omit<LineForFormat, "quantity">): string {
  const params = uniqSegments((line.item_params_display ?? []).map((p) => formatParamSegment(p)).filter(Boolean));
  const mods = uniqSegments((line.modifiers ?? []).map((m) => (m.name || "").trim()).filter(Boolean));
  return JSON.stringify({ n: line.name.trim(), p: params, m: mods });
}

export type GroupedLine<T extends LineForFormat> = T & { _signature: string };

/** Group identical lines by name + params + modifier names. Preserves extra fields from T. */
export function groupOrderLines<T extends LineForFormat>(lines: T[]): Array<GroupedLine<T>> {
  const bySig = new Map<string, GroupedLine<T>>();
  const order: string[] = [];

  for (const l of lines) {
    const sig = lineSignature({
      name: l.name,
      item_params_display: l.item_params_display ?? null,
      modifiers: l.modifiers ?? null,
    });

    const prev = bySig.get(sig);
    if (prev) {
      prev.quantity += l.quantity;
      if (typeof (prev as any).line_total_cents === "number" && typeof (l as any).line_total_cents === "number") {
        (prev as any).line_total_cents += (l as any).line_total_cents;
      }
    } else {
      bySig.set(sig, { ...(l as any), _signature: sig });
      order.push(sig);
    }
  }

  return order.map((sig) => bySig.get(sig)!).filter(Boolean);
}

/**
 * Одна строка: «2× Капучино, 300 мл, коровье, сироп» — параметры и модификаторы через запятую.
 */
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
