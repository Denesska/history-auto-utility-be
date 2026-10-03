import { baseUsername, generateUniqueUsername, orgInitials } from './username.util';

describe('username util', () => {
  it('builds the base from last name (5) + first name (2)', () => {
    expect(baseUsername('Denis', 'Gandzii')).toBe('gandzde');
    expect(baseUsername('Ana', 'Ion')).toBe('ionan');
    expect(baseUsername('Ștefan', 'Țurcanu')).toBe('turcast');
  });

  it('uses 7 letters of a single name and pads to 3 chars', () => {
    expect(baseUsername('', 'Alexandrescu')).toBe('alexand');
    expect(baseUsername('Li', '')).toBe('li0');
  });

  it('ignores legal suffixes in org initials', () => {
    expect(orgInitials('Denhau Solutions SRL')).toBe('ds');
  });

  it('falls back to initials, then numbers', async () => {
    const taken = new Set(['gandzde', 'gandzdeds', 'gandzde2']);
    const name = await generateUniqueUsername('Denis', 'Gandzii', 'Denhau Solutions SRL', async u => taken.has(u));
    expect(name).toBe('gandzde3');
    expect(await generateUniqueUsername('Denis', 'Gandzii', 'Denhau Solutions SRL', async u => u === 'gandzde')).toBe('gandzdeds');
  });
});
