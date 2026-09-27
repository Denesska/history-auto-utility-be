// Palette keys a note's `color` may take (null = default surface). Mirrored on the
// frontend in features/cars/state/car-notes/car-notes.constants.ts.
export const NOTE_COLORS = ['coral', 'peach', 'sand', 'mint', 'sage', 'fog', 'storm', 'dusk', 'blossom', 'clay'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_MAX_LABELS = 20;
export const NOTE_LABEL_MAX_LENGTH = 40;
export const NOTE_MAX_ITEMS = 200;
export const NOTE_ITEM_TEXT_MAX_LENGTH = 500;
