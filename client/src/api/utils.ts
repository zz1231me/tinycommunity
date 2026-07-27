// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap<T = any>(res: { data: unknown }): T {
  const d = res.data;
  if (d !== null && typeof d === 'object' && 'data' in d) {
    return (d as { data: T }).data;
  }
  return d as T;
}
