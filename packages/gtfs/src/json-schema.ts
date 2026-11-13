// Tiny JSON Schema validator covering the subset our data schemas use:
// type, required, properties, additionalProperties (bool or schema), items, prefixItems, enum,
// pattern, minLength, minimum, maximum, minItems, maxItems, uniqueItems, $ref to "#/$defs/…".

export interface Schema {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema | false;
  prefixItems?: Schema[];
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  $ref?: string;
  $defs?: Record<string, Schema>;
  [k: string]: unknown;
}

const typeOf = (v: unknown) =>
  v === null
    ? "null"
    : Array.isArray(v)
      ? "array"
      : typeof v === "number" && Number.isInteger(v)
        ? "integer"
        : typeof v;

function matchesType(v: unknown, t: string) {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
}

/** Validate `value`; returns a list of error messages (empty = valid). Stops after `max` errors. */
export function validate(schema: Schema, value: unknown, max = 20): string[] {
  const errors: string[] = [];
  const root = schema;
  const walk = (s: Schema, v: unknown, path: string) => {
    if (errors.length >= max) return;
    if (s.$ref) {
      const name = s.$ref.replace(/^#\/\$defs\//, "");
      const def = root.$defs?.[name];
      if (!def) errors.push(`${path}: unknown $ref ${s.$ref}`);
      else walk(def, v, path);
      return;
    }
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => matchesType(v, t))) {
        errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(v)}`);
        return;
      }
    }
    if (s.enum && !s.enum.some((e) => e === v)) errors.push(`${path}: not in enum`);
    if (typeof v === "string") {
      if (s.minLength !== undefined && v.length < s.minLength) errors.push(`${path}: too short`);
      if (s.pattern && !new RegExp(s.pattern, "u").test(v))
        errors.push(`${path}: ${JSON.stringify(v)} does not match ${s.pattern}`);
    }
    if (typeof v === "number") {
      if (s.minimum !== undefined && v < s.minimum) errors.push(`${path}: ${v} < ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) errors.push(`${path}: ${v} > ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${path}: too few items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) errors.push(`${path}: too many items`);
      if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length)
        errors.push(`${path}: items not unique`);
      const pre = s.prefixItems ?? [];
      v.forEach((x, i) => {
        const is = i < pre.length ? pre[i] : s.items;
        if (is === false) errors.push(`${path}[${i}]: no additional items allowed`);
        else if (is) walk(is, x, `${path}[${i}]`);
      });
    }
    if (typeOf(v) === "object") {
      const o = v as Record<string, unknown>;
      for (const r of s.required ?? []) if (!(r in o)) errors.push(`${path}: missing ${r}`);
      for (const [k, x] of Object.entries(o)) {
        const ps = s.properties?.[k];
        if (ps) walk(ps, x, `${path}.${k}`);
        else if (s.additionalProperties === false) errors.push(`${path}: unexpected property ${k}`);
        else if (typeof s.additionalProperties === "object")
          walk(s.additionalProperties, x, `${path}.${k}`);
      }
    }
  };
  walk(schema, value, "$");
  return errors;
}
