/**
 * Minimal writer for IFC STEP physical files (ISO 10303-21).
 * Build entities with `add()`, which returns a reference usable in later entities.
 */

/** A reference to an entity, written as #id. */
export class Ref {
  constructor(readonly id: number) {}
}

/** An enumeration value, written as .VALUE. */
export class Enum {
  constructor(readonly value: string) {}
}

/** A typed value such as IFCLABEL('x'), used in SELECT attributes. */
export class Typed {
  constructor(
    readonly type: string,
    readonly value: StepValue,
  ) {}
}

/** Derived attribute, written as *. */
export const DERIVED = Symbol('derived');

export type StepValue =
  null | undefined | boolean | number | string | Ref | Enum | Typed | typeof DERIVED | StepValue[];

/** Marks a number that must be written as an INTEGER (no decimal point). */
export class Int {
  constructor(readonly value: number) {}
}

/** Encode a string for STEP: escape quotes and backslashes, non-ASCII as \X2\…\X0\. */
export function encodeString(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === '\\') out += '\\\\';
    else if (code >= 32 && code < 127) out += ch;
    else if (code <= 0xffff)
      out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`;
    else out += `\\X4\\${code.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`;
  }
  return `'${out}'`;
}

/** Format a REAL: always with a decimal point, no exponent for normal magnitudes. */
export function formatReal(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Non-finite REAL: ${n}`);
  if (Object.is(n, -0) || n === 0) return '0.';
  let s =
    Math.abs(n) < 1e-6 || Math.abs(n) >= 1e15 ? n.toExponential(12) : String(+n.toPrecision(15));
  if (s.includes('e')) {
    const [m, e] = s.split('e');
    const mant = m!.includes('.') ? m! : `${m}.`;
    s = `${mant}E${e!.replace('+', '')}`;
  } else if (!s.includes('.')) s += '.';
  return s;
}

export function formatValue(v: StepValue | Int): string {
  if (v === null || v === undefined) return '$';
  if (v === DERIVED) return '*';
  if (v instanceof Int) return String(Math.trunc(v.value));
  if (typeof v === 'boolean') return v ? '.T.' : '.F.';
  if (typeof v === 'number') return formatReal(v);
  if (typeof v === 'string') return encodeString(v);
  if (v instanceof Ref) return `#${v.id}`;
  if (v instanceof Enum) return `.${v.value}.`;
  if (v instanceof Typed) return `${v.type.toUpperCase()}(${formatValue(v.value)})`;
  if (Array.isArray(v)) return `(${v.map((x) => formatValue(x as StepValue)).join(',')})`;
  throw new TypeError(`Unsupported STEP value: ${String(v)}`);
}

export class StepFile {
  private readonly lines: string[] = [];
  private nextId = 1;

  add(type: string, ...attrs: (StepValue | Int)[]): Ref {
    const id = this.nextId++;
    this.lines.push(`#${id}=${type.toUpperCase()}(${attrs.map(formatValue).join(',')});`);
    return new Ref(id);
  }

  toString(header: { name: string; description: string; timestamp: string; app: string }): string {
    return [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_DESCRIPTION((${encodeString(header.description)}),'2;1');`,
      `FILE_NAME(${encodeString(header.name)},${encodeString(header.timestamp)},(''),(''),${encodeString(header.app)},${encodeString(header.app)},'');`,
      "FILE_SCHEMA(('IFC4X3_ADD2'));",
      'ENDSEC;',
      'DATA;',
      ...this.lines,
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n');
  }
}

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** A new IFC GlobalId: a random 128-bit UUID compressed to 22 characters. */
export function ifcGuid(random: () => number = Math.random): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // UUID v4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  // 2 bits, then 21 groups of 6 bits.
  let out = GUID_CHARS[bytes[0]! >> 6]!;
  let acc = BigInt(0);
  for (const b of bytes) acc = (acc << BigInt(8)) | BigInt(b);
  for (let i = 20; i >= 0; i--) out += GUID_CHARS[Number((acc >> BigInt(i * 6)) & BigInt(63))]!;
  return out;
}
