/**
 * True when `e` is a Prisma unique-constraint violation (P2002) on the given column.
 * With the Prisma 7 driver adapter (`@prisma/adapter-pg`) `meta.target` is no longer populated; the violated
 * constraint is reported in `meta.driverAdapterError.cause.constraint` (`index` = DB index name such as
 * `Car_vin_key`, or `fields`). Both shapes are checked so this works with and without an adapter.
 */
export function isUniqueViolationOn(e: any, field: string): boolean {
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target) ? target.includes(field) : typeof target === 'string' && target.includes(field)) return true;
  const constraint = e.meta?.driverAdapterError?.cause?.constraint;
  if (!constraint) return false;
  if (Array.isArray(constraint.fields) && constraint.fields.includes(field)) return true;
  return typeof constraint.index === 'string' && constraint.index.includes(`_${field}_`);
}
