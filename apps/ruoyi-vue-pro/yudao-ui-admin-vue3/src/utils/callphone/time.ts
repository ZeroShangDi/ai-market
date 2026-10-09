/** Parse Call Phone timestamps without moving timezone-less local datetimes to UTC. */
export function parseCallPhoneDateTime(value: string | number): Date {
  if (typeof value === 'number') return new Date(value)
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T')
  return new Date(normalized)
}
