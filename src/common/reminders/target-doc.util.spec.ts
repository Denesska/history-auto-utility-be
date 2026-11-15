import { reminderTargetDoc } from './target-doc.util';

const d = (s: string) => new Date(`${s}T00:00:00`);
const doc = (id: number, expiry: string | null) => ({ id, expiry_date: expiry ? d(expiry) : null });

describe('reminderTargetDoc', () => {
  it('returns null for no docs', () => expect(reminderTargetDoc([])).toBeNull());

  it('returns null when no doc has an expiry', () => expect(reminderTargetDoc([doc(1, null)])).toBeNull());

  it('single doc: itself', () => expect(reminderTargetDoc([doc(1, '2026-11-04')])?.id).toBe(1));

  it('renewal (continuous or overlapping): targets the newer doc', () => {
    expect(reminderTargetDoc([doc(1, '2026-11-04'), doc(2, '2027-11-04')])?.id).toBe(2);
  });

  it('gap before the newer doc: still targets the newer doc', () => {
    expect(reminderTargetDoc([doc(1, '2026-11-04'), doc(2, '2027-11-09')])?.id).toBe(2);
  });

  it('newer doc not yet started (future): old doc is superseded', () => {
    expect(reminderTargetDoc([doc(1, '2026-11-04'), doc(2, '2028-01-01')])?.id).toBe(2);
  });

  it('chains several renewals regardless of order', () => {
    expect(reminderTargetDoc([doc(3, '2028-11-04'), doc(1, '2026-11-04'), doc(2, '2027-11-04')])?.id).toBe(3);
  });

  it('only expired docs: latest expiry', () => {
    expect(reminderTargetDoc([doc(1, '2024-12-31'), doc(2, '2025-12-31')])?.id).toBe(2);
  });

  it('same expiry day: higher id wins', () => {
    expect(reminderTargetDoc([doc(5, '2026-11-04'), doc(2, '2026-11-04')])?.id).toBe(5);
  });
});
