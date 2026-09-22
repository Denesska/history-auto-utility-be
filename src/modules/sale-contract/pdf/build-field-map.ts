/**
 * One-off generator for `field-map.json`.
 *
 *     npx ts-node src/modules/sale-contract/pdf/build-field-map.ts
 *
 * This is tooling, not runtime code: nothing in the Nest application imports it.
 * Run it again only if the template PDF is replaced by a new ITL 054 revision,
 * then review the diff of the JSON before committing.
 *
 * ---------------------------------------------------------------------------
 * How it finds the blanks
 * ---------------------------------------------------------------------------
 * The template has no AcroForm fields — it is a Word export whose "blanks" are
 * literally runs of full stops and ellipses. pdf.js's `getTextContent()` is not
 * precise enough for us: it merges a whole justified line into one item, so we
 * would only learn where the line starts, not where the 4th dotted run inside it
 * starts. We therefore walk the *operator list* instead and re-run the PDF text
 * state machine ourselves. That gives an exact x for every single glyph, because
 * every glyph carries its advance width and every TJ kerning number is visible.
 *
 * The template only uses `Tf`/`Tm`/`Tc`/`Tj` (verified: no `Tw`, `Tz`, `TD`,
 * `T*`), so the simulation below is complete rather than approximate. It is
 * cross-checked against `getTextContent()` before anything is written out.
 *
 * ---------------------------------------------------------------------------
 * How blanks get names
 * ---------------------------------------------------------------------------
 * Geometry alone cannot tell "judeţul" from "codul poştal" — both are just dots.
 * So the mapping is an explicit table below, keyed by (baseline y, index of the
 * dotted run on that line). The generator refuses to emit anything if a keyed
 * run has vanished or if the form text around it changed, which is the whole
 * point: a silent shift would put someone's CNP on the wrong line of a fiscal
 * document.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from 'fs';
import * as path from 'path';
import { FieldMap, FieldMapEntry, MarkMapEntry } from './field-map.types';

// pdf.js needs a DOM to bind fonts for *rendering*. We never render, but the
// worker still posts font objects at us, so give it just enough of a `document`
// to fail quietly instead of throwing after we already have our operator list.
if (typeof (global as any).document === 'undefined') {
    (global as any).document = {
        createElement: () => ({ sheet: { cssRules: [], insertRule: () => undefined }, style: {}, getContext: () => null }),
        documentElement: { getElementsByTagName: () => [{ appendChild: () => undefined }] },
    };
}

const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');

const TEMPLATE_PATH = path.join(__dirname, '..', 'assets', 'itl-054-anexa-2.pdf');
const OUTPUT_PATH = path.join(__dirname, 'field-map.json');

/** Runs of these characters are what the form uses for a blank. The document
 *  mixes ASCII full stops with U+2026 ellipses, sometimes inside one run. */
const BLANK_RUN = /[.…]{3,}/g;

/** Keep our text clear of the printed word that follows the blank. */
const RIGHT_MARGIN_PT = 1.5;

/** Lift the value just off the dotted rule so descenders (ţ, p, g) do not
 *  collide with the dots. */
const BASELINE_LIFT_PT = 1.0;

/** DejaVu Serif has a larger x-height and wider glyphs than the Times New Roman
 *  the form was typeset in, so matching the nominal size would look oversized
 *  and overflow constantly. One point down reads as the same size on paper. */
const SIZE_REDUCTION_PT = 1.0;

// ---------------------------------------------------------------------------
// The hand-maintained (line, run) -> field key table
// ---------------------------------------------------------------------------

interface Mapping {
    /** Baseline y of the line, rounded to 0.5pt — see `lineKey()`. */
    y: number;
    /** Zero-based index of the dotted run within that line. */
    run: number;
    /** Dotted path into SaleContractPdfData. Empty string = deliberately unmapped. */
    key: string;
    /** Some fields are printed as two dotted runs separated by a space (the form
     *  wraps "str. ...... ......"). Setting this merges `span` consecutive runs
     *  into one wide field. */
    span?: number;
    /** Why a blank is left alone, for the `unmapped` section of the map. */
    reason?: string;
}

/** Section (1) and section (2) are typographically identical; only the baselines
 *  differ. Generating both from one description keeps them from drifting apart. */
function partyMappings(party: 'seller' | 'buyer', y: Record<string, number>): Mapping[] {
    const p = (suffix: string) => `${party}.${suffix}`;
    return [
        { y: y.name, run: 0, key: p('full_name') },

        // "domiciliul/sediul în ROMÂNIA/ ..., judeţul ..., codul poştal ..., municipiul/oraşul/comuna"
        { y: y.addr1, run: 0, key: p('address.country') },
        { y: y.addr1, run: 1, key: p('address.county') },
        { y: y.addr1, run: 2, key: p('address.postal_code') },

        // "... , satul/sectorul ..., str. ..., nr. ..., bl."
        { y: y.addr2, run: 0, key: p('address.city') },
        { y: y.addr2, run: 1, key: p('address.village_or_sector') },
        { y: y.addr2, run: 2, key: p('address.street') },
        { y: y.addr2, run: 3, key: p('address.street_number') },

        // "..., sc. ..., et. ..., ap ..., identificat prin B.I./C.I./... seria ... nr. ...,"
        { y: y.addr3, run: 0, key: p('address.building') },
        { y: y.addr3, run: 1, key: p('address.staircase') },
        { y: y.addr3, run: 2, key: p('address.floor') },
        { y: y.addr3, run: 3, key: p('address.apartment') },
        { y: y.addr3, run: 4, key: p('id_series') },
        { y: y.addr3, run: 5, key: p('id_number') },

        // "C.N.P./C.I.F ..., tel./fax ..., e-mail ..., şi domiciliul"
        { y: y.contact, run: 0, key: p('cnp_or_cif') },
        { y: y.contact, run: 1, key: p('phone') },
        { y: y.contact, run: 2, key: p('email') },

        // "fiscal în ROMÂNIA/ ..., judeţul ..., codul poştal ...,"
        { y: y.fiscal1, run: 0, key: p('fiscal_address.country') },
        { y: y.fiscal1, run: 1, key: p('fiscal_address.county') },
        { y: y.fiscal1, run: 2, key: p('fiscal_address.postal_code') },

        // "municipiul/oraşul/comuna ..., satul/sectorul ..., str. ...... ......,"
        // The street blank is split in two by the Word export; merge them back.
        { y: y.fiscal2, run: 0, key: p('fiscal_address.city') },
        { y: y.fiscal2, run: 1, key: p('fiscal_address.village_or_sector') },
        { y: y.fiscal2, run: 2, key: p('fiscal_address.street'), span: 2 },

        // "nr. ..., bl. ..., sc. ..., et. ..., ap ..., reprezentată prin ... identificat prin"
        { y: y.fiscal3, run: 0, key: p('fiscal_address.street_number') },
        { y: y.fiscal3, run: 1, key: p('fiscal_address.building') },
        { y: y.fiscal3, run: 2, key: p('fiscal_address.staircase') },
        { y: y.fiscal3, run: 3, key: p('fiscal_address.floor') },
        { y: y.fiscal3, run: 4, key: p('fiscal_address.apartment') },
        { y: y.fiscal3, run: 5, key: p('representative.full_name') },

        // "B.I./C.I./... seria ... nr. ..., C.I.F ..., tel./fax ..., e-mail"
        { y: y.rep, run: 0, key: p('representative.id_series') },
        { y: y.rep, run: 1, key: p('representative.id_number') },
        { y: y.rep, run: 2, key: p('representative.cif') },
        { y: y.rep, run: 3, key: p('representative.phone') },

        // The representative's e-mail blank wraps onto the next line, ahead of
        // "în calitate de".
        { y: y.capacity, run: 0, key: p('representative.email') },
        { y: y.capacity, run: 1, key: p('capacity') },
    ];
}

const MAPPINGS: Mapping[] = [
    // --- Cartuş A (top left) — organul fiscal al vânzătorului. Never ours. ---
    { y: 736.5, run: 0, key: '', reason: 'cartuş A — REMTII number, filled by the local tax authority' },
    { y: 736.5, run: 1, key: '', reason: 'cartuş A — REMTII month/year, filled by the local tax authority' },
    { y: 725.0, run: 0, key: '', reason: 'cartuş A — "Rol nr.", filled by the local tax authority' },

    // --- Cartuş B (top right) — the attesting official's own details. ---
    { y: 745.5, run: 0, key: '', reason: 'cartuş B — official\'s first name' },
    { y: 734.0, run: 0, key: '', reason: 'cartuş B — official\'s surname' },
    { y: 722.5, run: 0, key: '', reason: 'cartuş B — official\'s function' },

    // --- (1) Persoana care înstrăinează ---
    ...partyMappings('seller', {
        name: 690.0,
        addr1: 678.5,
        addr2: 667.0,
        addr3: 655.5,
        contact: 644.0,
        fiscal1: 632.5,
        fiscal2: 621.0,
        fiscal3: 609.5,
        rep: 598.0,
        capacity: 586.5,
    }),

    // --- (2) Persoana care dobândeşte ---
    ...partyMappings('buyer', {
        name: 574.5,
        addr1: 563.0,
        addr2: 551.5,
        addr3: 540.0,
        contact: 528.5,
        fiscal1: 517.0,
        fiscal2: 505.5,
        fiscal3: 494.0,
        rep: 482.5,
        capacity: 471.0,
    }),

    // --- (3) Obiectul contractului ---
    { y: 447.5, run: 0, key: 'vehicle.make' },
    { y: 447.5, run: 1, key: 'vehicle.type' },
    { y: 447.5, run: 2, key: 'vehicle.vin' },
    // "serie motor" wraps: the label ends the previous line, the blank opens this one.
    { y: 436.0, run: 0, key: 'vehicle.engine_series' },
    { y: 436.0, run: 1, key: 'vehicle.engine_capacity_cm3' },
    { y: 436.0, run: 2, key: 'vehicle.max_weight_tons' },
    { y: 424.5, run: 0, key: 'vehicle.license_plate' },
    { y: 424.5, run: 1, key: 'vehicle.itp_expiry_date' },
    { y: 413.0, run: 0, key: 'vehicle.civ_number' },
    { y: 413.0, run: 1, key: 'vehicle.manufacture_year' },
    { y: 413.0, run: 2, key: 'vehicle.euro_norm' },
    { y: 413.0, run: 3, key: 'vehicle.acquired_date' },
    { y: 401.5, run: 0, key: 'vehicle.acquired_document' },

    // --- (4) Preţul ---
    { y: 389.5, run: 0, key: 'price_lei' },
    { y: 389.5, run: 1, key: 'price_in_words' },

    // --- Data şi locul încheierii contractului ---
    { y: 273.5, run: 0, key: 'signing_date' },
    { y: 273.5, run: 1, key: 'signing_place' },

    // --- Signatures — wet ink only. ---
    { y: 262.0, run: 0, key: '', reason: 'signature line — signed by hand' },
    { y: 262.0, run: 1, key: '', reason: 'signature line — signed by hand' },
    { y: 202.5, run: 0, key: '', reason: '"Conform cu originalul" signature line — signed by hand on the copies' },
    { y: 202.5, run: 1, key: '', reason: '"Conform cu originalul" signature line — signed by hand on the copies' },

    // --- Cartuş C (bottom left) — organul fiscal al cumpărătorului. ---
    { y: 119.5, run: 0, key: '', reason: 'cartuş C — REMTII number, filled by the local tax authority' },
    { y: 119.5, run: 1, key: '', reason: 'cartuş C — REMTII month, filled by the local tax authority' },
    { y: 119.5, run: 2, key: '', reason: 'cartuş C — REMTII year, filled by the local tax authority' },
    { y: 109.0, run: 0, key: '', reason: 'cartuş C — "Rol nr.", filled by the local tax authority' },

    // --- Cartuş D (bottom right) — the attesting official's own details. ---
    { y: 122.0, run: 0, key: '', reason: 'cartuş D — official\'s first name' },
    { y: 111.5, run: 0, key: '', reason: 'cartuş D — official\'s surname' },
    { y: 101.5, run: 0, key: '', reason: 'cartuş D — official\'s function' },
];

// ---------------------------------------------------------------------------
// PDF text-state simulation
// ---------------------------------------------------------------------------

interface Glyph {
    c: string;
    x: number;
    y: number;
    w: number;
    size: number;
}

interface Line {
    y: number;
    text: string;
    glyphs: Glyph[];
}

/** Baselines wobble by fractions of a point between runs on the same visual
 *  line; snapping to the nearest half point groups them without ever merging
 *  two real lines (the tightest line spacing on this form is 0.5pt for the
 *  overlapping cartuş labels, which we never touch). */
function lineKey(y: number): number {
    return Math.round(y * 2) / 2;
}

interface TextItem {
    x: number;
    y: number;
    width: number;
    str: string;
}

async function readGlyphs(): Promise<{ glyphs: Glyph[]; width: number; height: number; itemStarts: TextItem[] }> {
    const data = new Uint8Array(fs.readFileSync(TEMPLATE_PATH));
    const doc = await pdfjs.getDocument({ data }).promise;
    if (doc.numPages !== 1) {
        throw new Error(`Expected a single-page template, got ${doc.numPages} pages.`);
    }
    const page = await doc.getPage(1);
    const [, , width, height] = page.getViewport(1.0).viewBox;
    const ops = await page.getOperatorList();
    const names: Record<number, string> = {};
    for (const [name, code] of Object.entries(pdfjs.OPS)) names[code as number] = name;

    const glyphs: Glyph[] = [];
    let tm: number[] = [1, 0, 0, 1, 0, 0];
    let size = 0;
    let charSpacing = 0;
    // `Tc` lives in the graphics state, so it has to unwind with q/Q.
    const gsStack: number[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
        const op = names[ops.fnArray[i]];
        const args = ops.argsArray[i];
        switch (op) {
            case 'save':
                gsStack.push(charSpacing);
                break;
            case 'restore':
                charSpacing = gsStack.pop() ?? 0;
                break;
            case 'beginText':
                tm = [1, 0, 0, 1, 0, 0];
                break;
            case 'setTextMatrix':
                tm = (args as number[]).slice(0, 6);
                break;
            case 'setFont':
                size = args[1];
                break;
            case 'setCharSpacing':
                charSpacing = args[0];
                break;
            // The template uses none of the operators below; if a future
            // revision does, the simulation would silently drift.
            case 'setWordSpacing':
            case 'setHScale':
            case 'moveText':
            case 'nextLine':
            case 'setLeading':
            case 'nextLineShowText':
            case 'nextLineSetSpacingShowText':
                throw new Error(`Template uses unsupported text operator "${op}" — extend the simulation.`);
            case 'showText': {
                for (const g of args[0]) {
                    if (typeof g === 'number') {
                        // A TJ kerning number: advance (or retreat) without drawing.
                        tm[4] += (-g / 1000) * size;
                        continue;
                    }
                    const advance = (g.width / 1000) * size + charSpacing;
                    glyphs.push({ c: g.unicode, x: tm[4], y: tm[5], w: advance, size });
                    tm[4] += advance;
                }
                break;
            }
            default:
                break;
        }
    }

    const tc = await page.getTextContent();
    const itemStarts = tc.items.map((it: any) => ({ x: it.transform[4], y: it.transform[5], width: it.width, str: it.str }));
    return { glyphs, width, height, itemStarts };
}

function toLines(glyphs: Glyph[]): Map<number, Line> {
    const byY = new Map<number, Glyph[]>();
    for (const g of glyphs) {
        const k = lineKey(g.y);
        if (!byY.has(k)) byY.set(k, []);
        byY.get(k).push(g);
    }
    const lines = new Map<number, Line>();
    for (const [y, gs] of byY) {
        gs.sort((a, b) => a.x - b.x);
        lines.set(y, { y, text: gs.map((g) => g.c).join(''), glyphs: gs });
    }
    return lines;
}

/**
 * Sanity check against pdf.js's own (coarser) text API, which accumulates the
 * same advances through completely different code.
 *
 * Two assertions, because either alone is too weak. Item *starts* mostly come
 * straight from `Tm` and so would agree even if our advance arithmetic were
 * wrong; line *ends* are pure accumulated advance and so catch exactly that —
 * they are what proved the graphics-state stack above is needed for `Tc`
 * (without it the footnote lines come out 19pt short).
 */
function crossCheck(glyphs: Glyph[], items: TextItem[]): void {
    for (const item of items) {
        if (!item.str) continue;
        const hit = glyphs.some((g) => Math.abs(g.y - item.y) < 0.01 && Math.abs(g.x - item.x) < 0.05);
        if (!hit) {
            throw new Error(`Text-state simulation disagrees with pdf.js: no glyph at y=${item.y} x=${item.x} (${JSON.stringify(item.str.slice(0, 20))}).`);
        }
    }

    const ourEnd = new Map<number, number>();
    for (const g of glyphs) {
        const k = Math.round(g.y * 100) / 100;
        ourEnd.set(k, Math.max(ourEnd.get(k) ?? -Infinity, g.x + g.w));
    }
    for (const item of items) {
        const k = Math.round(item.y * 100) / 100;
        const ours = ourEnd.get(k);
        if (ours === undefined) continue;
        const theirs = item.x + item.width;
        if (theirs - ours > 0.05) {
            throw new Error(`Text-state simulation ends line y=${k} at ${ours} but pdf.js reaches ${theirs}.`);
        }
    }
}

interface Run {
    start: number;
    end: number;
    x: number;
    y: number;
    width: number;
    size: number;
}

function blankRuns(line: Line): Run[] {
    const runs: Run[] = [];
    BLANK_RUN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLANK_RUN.exec(line.text)) !== null) {
        const first = line.glyphs[m.index];
        const last = line.glyphs[m.index + m[0].length - 1];
        runs.push({
            start: m.index,
            end: m.index + m[0].length,
            x: first.x,
            y: first.y,
            width: last.x + last.w - first.x,
            size: first.size,
        });
    }
    return runs;
}

/** A short excerpt of the form's own words around a blank, for human review. */
function labelFor(line: Line, run: Run, endIndex: number): string {
    const before = line.text.slice(Math.max(0, run.start - 40), run.start);
    const after = line.text.slice(endIndex, endIndex + 24);
    return `${before}…${after}`.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Marks (the pseudo-checkboxes)
// ---------------------------------------------------------------------------

/** Word's Wingdings "box" glyph, which is how the form draws ☐. */
const WINGDINGS_BOX = /[-]/g;

function buildMarks(lines: Map<number, Line>): Record<string, MarkMapEntry> {
    const marks: Record<string, MarkMapEntry> = {};

    // "Original             Copie" in cartuş A. The Word export dropped the two
    // ☐ glyphs that the printed form has, leaving only the gaps where they were:
    // a wide indent before "Original" and a run of spaces before "Copie". We put
    // the X in those gaps, immediately left of each word, which is where a clerk
    // would tick and — crucially — is empty in the template, so nothing overlaps.
    const originalLine = lines.get(714.0);
    if (!originalLine) throw new Error('Could not find the "Original / Copie" line (y=714.0).');
    const originalIdx = originalLine.text.indexOf('Original');
    const copieIdx = originalLine.text.indexOf('Copie');
    if (originalIdx < 0 || copieIdx < 0) throw new Error('The "Original / Copie" line no longer reads as expected.');
    const originalGlyph = originalLine.glyphs[originalIdx];
    const copieGlyph = originalLine.glyphs[copieIdx];
    // ~9pt to the left of the word leaves the X visually attached to it without
    // touching the previous word (the smallest gap here is 20pt).
    marks.original = { x: originalGlyph.x - 9, y: originalGlyph.y, size: originalGlyph.size - SIZE_REDUCTION_PT, label: 'Original' };
    marks.copy = { x: copieGlyph.x - 9, y: copieGlyph.y, size: copieGlyph.size - SIZE_REDUCTION_PT, label: 'Copie' };

    // "Anexe la contract : ☐ Da ☐ Nu" — here the ☐ glyphs survived the export as
    // private-use Wingdings characters, so we can centre an X on each one.
    const annexLine = lines.get(330.5);
    if (!annexLine) throw new Error('Could not find the "Anexe la contract" line (y=330.5).');
    const boxes: Glyph[] = [];
    WINGDINGS_BOX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WINGDINGS_BOX.exec(annexLine.text)) !== null) boxes.push(annexLine.glyphs[m.index]);
    if (boxes.length !== 2) throw new Error(`Expected 2 checkbox glyphs on the annexes line, found ${boxes.length}.`);
    marks.annexes_yes = { x: boxes[0].x, y: boxes[0].y, size: boxes[0].size, label: 'Anexe la contract: Da' };
    marks.annexes_no = { x: boxes[1].x, y: boxes[1].y, size: boxes[1].size, label: 'Anexe la contract: Nu' };

    return marks;
}

// ---------------------------------------------------------------------------

export async function buildFieldMap(): Promise<FieldMap> {
    const { glyphs, width, height, itemStarts } = await readGlyphs();
    crossCheck(glyphs, itemStarts);

    const lines = toLines(glyphs);
    const runsByLine = new Map<number, Run[]>();
    let totalRuns = 0;
    for (const [y, line] of lines) {
        const runs = blankRuns(line);
        if (runs.length) {
            runsByLine.set(y, runs);
            totalRuns += runs.length;
        }
    }

    const fields: Record<string, FieldMapEntry> = {};
    const unmapped: FieldMap['unmapped'] = [];
    const consumed = new Set<string>();

    for (const mapping of MAPPINGS) {
        const runs = runsByLine.get(mapping.y);
        if (!runs) throw new Error(`No dotted runs on line y=${mapping.y} (expected for "${mapping.key || mapping.reason}").`);
        const run = runs[mapping.run];
        if (!run) throw new Error(`Line y=${mapping.y} has ${runs.length} dotted runs; mapping asked for #${mapping.run}.`);

        const span = mapping.span ?? 1;
        const lastRun = runs[mapping.run + span - 1];
        if (!lastRun) throw new Error(`Line y=${mapping.y} cannot span ${span} runs from #${mapping.run}.`);
        for (let i = 0; i < span; i++) consumed.add(`${mapping.y}#${mapping.run + i}`);

        const line = lines.get(mapping.y);
        const label = labelFor(line, run, lastRun.end);

        if (!mapping.key) {
            unmapped.push({ y: mapping.y, run: mapping.run, label, reason: mapping.reason ?? 'not ours to fill' });
            continue;
        }
        if (fields[mapping.key]) throw new Error(`Duplicate field key "${mapping.key}".`);

        fields[mapping.key] = {
            x: round2(run.x),
            y: round2(run.y + BASELINE_LIFT_PT),
            width: round2(lastRun.x + lastRun.width - run.x - RIGHT_MARGIN_PT),
            size: round2(run.size - SIZE_REDUCTION_PT),
            label,
        };
    }

    // Anything the table forgot is a bug, not a silent omission.
    const missed: string[] = [];
    for (const [y, runs] of runsByLine) {
        runs.forEach((run, i) => {
            if (!consumed.has(`${y}#${i}`)) missed.push(`y=${y} run #${i} :: ${labelFor(lines.get(y), run, run.end)}`);
        });
    }
    if (missed.length) {
        throw new Error(`${missed.length} dotted run(s) are not accounted for by the mapping table:\n  ${missed.join('\n  ')}`);
    }

    const map: FieldMap = {
        source: path.basename(TEMPLATE_PATH),
        generatedAt: new Date().toISOString(),
        page: { width: round2(width), height: round2(height) },
        fields,
        marks: buildMarks(lines),
        unmapped,
    };

    // eslint-disable-next-line no-console
    console.log(`Found ${totalRuns} dotted runs: ${Object.keys(fields).length} fields mapped, ${unmapped.length} deliberately left blank.`);
    return map;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

if (require.main === module) {
    buildFieldMap()
        .then((map) => {
            fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
            // eslint-disable-next-line no-console
            console.log(`Wrote ${OUTPUT_PATH}`);
            process.exit(0);
        })
        .catch((err) => {
            // eslint-disable-next-line no-console
            console.error(err);
            process.exit(1);
        });
}
