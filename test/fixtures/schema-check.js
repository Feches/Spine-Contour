// A hand-written JSON Schema checker (draft 2020-12 subset) for the label record schema. Test-only: it lives
// in test/fixtures/, which the unit-test glob does not match, and the app takes no JSON Schema library.
//
//   validateAgainst(schema, value) -> { ok: boolean, errors: string[] }
//
// Supported keywords: type (object, array, string, number, integer, boolean, null), const, enum, required,
// properties, additionalProperties: false, $ref to '#/$defs/<name>', allOf, anyOf, oneOf, not, if/then/else,
// items, prefixItems, minItems, maxItems, uniqueItems (2026-10-11, D18: items compared deeply), minimum,
// exclusiveMinimum, minLength, pattern. The annotation keywords
// format, description, examples, $schema, $id, title (and the $defs container itself) are ignored. A schema that
// uses any other keyword throws, so an amendment can never pass silently on a rule this checker does not enforce.
//
// Every error starts with the JSON pointer of the failing value ('(root)' for the document itself); a missing
// required property is reported at the pointer where it should have been.

const IGNORED = new Set(['format', 'description', 'examples', '$schema', '$id', 'title', '$defs']);
const SUPPORTED = new Set([
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', '$ref', 'allOf', 'anyOf', 'oneOf', 'not',
  'if', 'then', 'else', 'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'exclusiveMinimum',
  'minLength', 'pattern',
]);

const escapePointer = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
const at = path => (path === '' ? '(root)' : path);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  return false;
}

function hasType(value, type) {
  switch (type) {
    case 'object': return isObject(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: throw new Error(`schema-check: unsupported type "${type}"`);
  }
}

function resolve(ref, root) {
  const match = /^#\/\$defs\/([^/]+)$/.exec(ref);
  const target = match && root.$defs?.[match[1]];
  if (!target) throw new Error(`schema-check: unsupported or unknown $ref "${ref}"`);
  return target;
}

// The errors for `value` against `schema`; an empty list means it validates.
function check(schema, value, path, root) {
  if (!isObject(schema)) throw new Error(`schema-check: unsupported schema at ${at(path)} (only schema objects)`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key) && !IGNORED.has(key)) throw new Error(`schema-check: unsupported keyword "${key}"`);
  }
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== 'boolean') {
    throw new Error('schema-check: uniqueItems must be a boolean');
  }
  const errors = [];
  const fail = message => errors.push(`${at(path)}: ${message}`);

  if (schema.$ref !== undefined) errors.push(...check(resolve(schema.$ref, root), value, path, root));

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => hasType(value, type))) fail(`expected type ${types.join(' or ')}`);
  }
  if (schema.const !== undefined && !equal(value, schema.const)) fail(`expected the constant ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.some(option => equal(value, option))) {
    fail(`expected one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && !(value >= schema.minimum)) fail(`must be >= ${schema.minimum}`);
    if (schema.exclusiveMinimum !== undefined && !(value > schema.exclusiveMinimum)) fail(`must be > ${schema.exclusiveMinimum}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail(`must be at least ${schema.minLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) fail(`must match ${schema.pattern}`);
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}/${escapePointer(key)}: required property is missing`);
    }
    const properties = schema.properties ?? {};
    for (const [key, sub] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...check(sub, value[key], `${path}/${escapePointer(key)}`, root));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}/${escapePointer(key)}: additional property is not allowed`);
      }
    } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      throw new Error('schema-check: additionalProperties other than false is unsupported');
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must have at most ${schema.maxItems} items`);
    if (schema.uniqueItems === true) {
      for (let i = 0; i < value.length; i += 1) {
        const j = value.findIndex((other, index) => index > i && equal(value[i], other));
        if (j >= 0) { fail(`items ${i} and ${j} are equal (uniqueItems)`); break; }
      }
    }
    const prefix = schema.prefixItems ?? [];
    prefix.forEach((sub, index) => {
      if (index < value.length) errors.push(...check(sub, value[index], `${path}/${index}`, root));
    });
    if (schema.items !== undefined) {
      for (let index = prefix.length; index < value.length; index += 1) {
        errors.push(...check(schema.items, value[index], `${path}/${index}`, root));
      }
    }
  }

  for (const sub of schema.allOf ?? []) errors.push(...check(sub, value, path, root));

  if (schema.anyOf !== undefined) {
    const branches = schema.anyOf.map(sub => check(sub, value, path, root));
    if (!branches.some(list => list.length === 0)) fail(`matches none of ${branches.length} anyOf branches (${branches.map(list => list.join('; ')).join(' | ')})`);
  }
  if (schema.oneOf !== undefined) {
    const branches = schema.oneOf.map(sub => check(sub, value, path, root));
    const matched = branches.filter(list => list.length === 0).length;
    if (matched === 0) fail(`matches none of ${branches.length} oneOf branches (${branches.map(list => list.join('; ')).join(' | ')})`);
    else if (matched > 1) fail(`matches ${matched} oneOf branches, expected exactly one`);
  }
  if (schema.not !== undefined && check(schema.not, value, path, root).length === 0) fail('must not match the "not" schema');

  if (schema.if !== undefined) {
    const branch = check(schema.if, value, path, root).length === 0 ? schema.then : schema.else;
    if (branch !== undefined) errors.push(...check(branch, value, path, root));
  }

  return errors;
}

/** @returns {{ok: boolean, errors: string[]}} */
export function validateAgainst(schema, value) {
  const errors = check(schema, value, '', schema);
  return { ok: errors.length === 0, errors };
}
