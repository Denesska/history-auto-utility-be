import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
// `@pdf-lib/fontkit` is a UMD bundle with no `__esModule` marker, so a default
// import compiles to `undefined` under this repo's tsconfig (no esModuleInterop).
import * as fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

import { ContractAddress, ContractPartyData, SaleContractPdfData } from '../sale-contract.types';
import { FieldMap, FieldMapEntry } from './field-map.types';
import { priceInWords } from './price-in-words.util';

/**
 * Fills the official ITL 054 / Model 2026 / Anexa nr. 2 sale-purchase contract.
 *
 * The template is the real, unmodified form and we only stamp values on top of
 * it. That is deliberate: the document is a standardised fiscal form, and a
 * counter clerk can refuse one whose layout, wording or footnotes differ from
 * the version they know. Nothing here writes, moves or covers any of the form's
 * own text — every coordinate comes from `field-map.json`, which was measured
 * off the template itself (see `build-field-map.ts`).
 *
 * The form's own type is Times New Roman, which we cannot redistribute, so our
 * values are set in DejaVu Serif. The mismatch is invisible in practice because
 * the two never meet inside a word, and DejaVu is one of the few freely
 * licensed serif faces with correct Romanian comma-below ș/ț (U+0219/U+021B).
 */
@Injectable()
export class SaleContractPdfService {
    private readonly logger = new Logger(SaleContractPdfService.name);

    /**
     * One page. The contract is filed in several exemplars (seller, buyer, local
     * tax authority, DRPCIV), but the user multiplies it at the printer — putting
     * four identical pages in the file just makes the download heavier and the
     * print dialog more confusing.
     *
     * Note the consequence: the single page has "Original" ticked, so every
     * printed copy says Original. Callers that want the Original/Copie ticks to
     * come out right can still ask for more pages via `opts.copies`, and page 2
     * onwards are ticked "Copie".
     */
    private static readonly DEFAULT_COPIES = 1;

    /** Nobody needs more than a handful, and an unbounded count from a request
     *  parameter is a cheap way to exhaust memory. */
    private static readonly MAX_COPIES = 10;

    /**
     * Floor for the auto-shrink, below which we truncate instead.
     *
     * 5pt rather than something more comfortable because of the form's micro
     * blanks: "nr. ......" is 15pt wide, which a house number like "142B" only
     * clears at this size. Truncating an address to "14…" would be a materially
     * wrong contract, so tiny-but-correct wins over legible-but-cut. Everything
     * else on a realistic contract renders at or near its nominal size.
     */
    private static readonly MIN_FONT_SIZE = 5;

    private static readonly FONT_STEP = 0.25;

    /**
     * Template bytes, font bytes and the coordinate map, read once. Cached as a
     * promise rather than a value so two concurrent first requests share one
     * disk read instead of racing.
     */
    private assets: Promise<{ template: Buffer; font: Buffer; map: FieldMap }> | null = null;

    /**
     * Renders a filled contract.
     *
     * @param opts.copies total number of pages, including the original.
     *        Defaults to 4; page 1 is ticked "Original", the rest "Copie".
     */
    async generate(data: SaleContractPdfData, opts?: { copies?: number }): Promise<Buffer> {
        const startedAt = Date.now();
        const requested = Math.trunc(opts?.copies ?? SaleContractPdfService.DEFAULT_COPIES);
        const copies = Math.min(SaleContractPdfService.MAX_COPIES, Math.max(1, requested || SaleContractPdfService.DEFAULT_COPIES));
        const { template, font: fontBytes, map } = await this.load();

        const out = await PDFDocument.create();
        // `Fontkit` is not re-exported from pdf-lib's root, and the bundle's own
        // typings describe the browser build, so the cast stays.
        out.registerFontkit(fontkit as any);
        // Subsetting keeps our font contribution to a few KB instead of shipping
        // the whole 380KB face.
        const font = await out.embedFont(fontBytes, { subset: true });
        // The blank form goes in once as a form XObject that all four pages
        // reference. Copying the page instead would duplicate its fonts and
        // images per page and quadruple the file (830KB vs ~250KB for something
        // that gets emailed), and it also guarantees the four copies are
        // byte-identical where the form itself is concerned.
        const [blankForm] = await out.embedPdf(template, [0]);

        const values = this.buildValues(data);

        for (let index = 0; index < copies; index++) {
            const page = out.addPage([blankForm.width, blankForm.height]);
            page.drawPage(blankForm, { x: 0, y: 0 });
            this.fillPage(page, font, map, values);
            this.markPage(page, font, map, index === 0, data.has_annexes === true);
        }

        const bytes = await out.save();
        // Never log field values — this document carries two people's CNPs.
        this.logger.log(`Sale contract rendered: ${copies} page(s), ${Object.keys(values).length} field(s) filled in ${Date.now() - startedAt}ms.`);
        return Buffer.from(bytes);
    }

    // -----------------------------------------------------------------------
    // Drawing
    // -----------------------------------------------------------------------

    private fillPage(page: PDFPage, font: PDFFont, map: FieldMap, values: Record<string, string>): void {
        for (const [key, value] of Object.entries(values)) {
            const field = map.fields[key];
            if (!field) {
                // A key without a blank means the value would silently vanish.
                // Log the key (not the value) so it is noticed in development.
                this.logger.warn(`No blank mapped for field "${key}" — value not printed.`);
                continue;
            }
            this.drawFitted(page, font, field, value);
        }
    }

    /**
     * Draws a value inside its blank, shrinking then truncating so it can never
     * run into the form's next printed word.
     *
     * This is the failure mode that matters: a long street name spilling across
     * ", nr. ......, bl." produces a document that looks tampered with and is
     * unreadable exactly where it matters. Clipping is not an option either
     * (pdf-lib has no clip primitive here), so the width budget is enforced by
     * measurement before anything is drawn.
     */
    private drawFitted(page: PDFPage, font: PDFFont, field: FieldMapEntry, raw: string): void {
        let text = this.sanitize(raw);
        if (!text) return;

        let size = field.size;
        while (font.widthOfTextAtSize(text, size) > field.width && size > SaleContractPdfService.MIN_FONT_SIZE) {
            size = Math.max(SaleContractPdfService.MIN_FONT_SIZE, size - SaleContractPdfService.FONT_STEP);
        }

        if (font.widthOfTextAtSize(text, size) > field.width) {
            text = this.truncateToWidth(text, font, size, field.width);
            if (!text) return;
        }

        page.drawText(text, { x: field.x, y: field.y, size, font, color: rgb(0, 0, 0) });
    }

    /** Longest prefix that fits, with an ellipsis so the reader can see that
     *  something was cut rather than believing the short value is complete. */
    private truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
        const ellipsis = '…';
        const budget = maxWidth - font.widthOfTextAtSize(ellipsis, size);
        if (budget <= 0) return '';
        let lo = 0;
        let hi = text.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (font.widthOfTextAtSize(text.slice(0, mid), size) <= budget) lo = mid;
            else hi = mid - 1;
        }
        return lo > 0 ? `${text.slice(0, lo).trimEnd()}${ellipsis}` : '';
    }

    /** The two tick marks we are allowed to make: original/copy, and annexes. */
    private markPage(page: PDFPage, font: PDFFont, map: FieldMap, isOriginal: boolean, hasAnnexes: boolean): void {
        const draw = (name: string) => {
            const mark = map.marks[name];
            if (!mark) {
                this.logger.warn(`Mark "${name}" is missing from the field map.`);
                return;
            }
            page.drawText('X', { x: mark.x, y: mark.y, size: mark.size, font, color: rgb(0, 0, 0) });
        };

        draw(isOriginal ? 'original' : 'copy');
        // An unticked pair reads as an unfinished form, and "no annexes" is the
        // normal case, so an absent flag is treated as "Nu" rather than blank.
        draw(hasAnnexes ? 'annexes_yes' : 'annexes_no');
    }

    /**
     * DejaVu Serif covers Latin and the Romanian diacritics but not, say, CJK or
     * emoji; pdf-lib throws when asked to encode a glyph the subset lacks, which
     * would turn one odd character in an address into a failed request. Drop
     * what cannot be drawn and normalise whitespace, so the worst case is a
     * missing character rather than a missing contract.
     */
    private sanitize(value: string): string {
        return value
            .replace(/\s+/g, ' ')
            .replace(/[^ -ɏəḀ-ỿ‐-‧€]/g, '')
            .trim();
    }

    // -----------------------------------------------------------------------
    // Data -> field keys
    // -----------------------------------------------------------------------

    /**
     * Flattens the payload onto the dotted keys used by `field-map.json`.
     * Empty, absent and blank values are left out entirely, which is how a blank
     * stays blank: the drawing pass only visits keys that are present here.
     */
    private buildValues(data: SaleContractPdfData): Record<string, string> {
        const values: Record<string, string> = {};
        const put = (key: string, value: unknown) => {
            if (value === undefined || value === null) return;
            const text = String(value).trim();
            if (text) values[key] = text;
        };

        this.putParty(put, 'seller', data.seller);
        this.putParty(put, 'buyer', data.buyer);

        const vehicle = data.vehicle ?? {};
        put('vehicle.make', vehicle.make);
        put('vehicle.type', vehicle.type);
        put('vehicle.vin', vehicle.vin);
        put('vehicle.engine_series', vehicle.engine_series);
        put('vehicle.engine_capacity_cm3', vehicle.engine_capacity_cm3);
        put('vehicle.max_weight_tons', vehicle.max_weight_tons);
        put('vehicle.license_plate', vehicle.license_plate);
        put('vehicle.itp_expiry_date', this.formatDate(vehicle.itp_expiry_date));
        put('vehicle.civ_number', vehicle.civ_number);
        put('vehicle.manufacture_year', vehicle.manufacture_year);
        put('vehicle.euro_norm', vehicle.euro_norm);
        put('vehicle.acquired_date', this.formatDate(vehicle.acquired_date));
        put('vehicle.acquired_document', vehicle.acquired_document);

        if (typeof data.price_lei === 'number' && Number.isFinite(data.price_lei)) {
            put('price_lei', this.formatAmount(data.price_lei));
            // The words are derived, never typed: the two must agree, and when
            // they do not it is the words that bind. An explicitly supplied
            // wording still wins, for the rare amount a converter gets wrong.
            put('price_in_words', data.price_in_words ?? priceInWords(data.price_lei));
        } else {
            put('price_in_words', data.price_in_words);
        }

        put('signing_date', this.formatDate(data.signing_date));
        put('signing_place', data.signing_place);

        return values;
    }

    private putParty(put: (key: string, value: unknown) => void, prefix: 'seller' | 'buyer', party?: ContractPartyData): void {
        if (!party) return;
        put(`${prefix}.full_name`, party.full_name);
        this.putAddress(put, `${prefix}.address`, party.address);
        put(`${prefix}.id_series`, party.id_series);
        put(`${prefix}.id_number`, party.id_number);
        put(`${prefix}.cnp_or_cif`, party.cnp_or_cif);
        put(`${prefix}.phone`, party.phone);
        put(`${prefix}.email`, party.email);
        this.putAddress(put, `${prefix}.fiscal_address`, party.fiscal_address);

        const rep = party.representative;
        if (rep) {
            put(`${prefix}.representative.full_name`, rep.full_name);
            put(`${prefix}.representative.id_series`, rep.id_series);
            put(`${prefix}.representative.id_number`, rep.id_number);
            put(`${prefix}.representative.cif`, rep.cif);
            put(`${prefix}.representative.phone`, rep.phone);
            put(`${prefix}.representative.email`, rep.email);
        }

        put(`${prefix}.capacity`, party.capacity);
    }

    private putAddress(put: (key: string, value: unknown) => void, prefix: string, address?: ContractAddress): void {
        if (!address) return;
        // The form prints "în ROMÂNIA/ ......" — the blank is for the *other*
        // country, so filling in "România" would read as a foreign address.
        const country = address.country?.trim();
        if (country && !/^rom[aâ]nia$/i.test(country)) put(`${prefix}.country`, country);

        put(`${prefix}.county`, address.county);
        put(`${prefix}.postal_code`, address.postal_code);
        put(`${prefix}.city`, address.city);
        put(`${prefix}.village_or_sector`, address.village_or_sector);
        put(`${prefix}.street`, address.street);
        put(`${prefix}.street_number`, address.street_number);
        put(`${prefix}.building`, address.building);
        put(`${prefix}.staircase`, address.staircase);
        put(`${prefix}.floor`, address.floor);
        put(`${prefix}.apartment`, address.apartment);
    }

    /** ISO dates become the dd.mm.yyyy a Romanian form expects; anything else
     *  is passed through, because the caller may legitimately have "2024" or a
     *  free-text acquisition date from an old document. */
    private formatDate(value?: string): string | undefined {
        if (!value) return undefined;
        const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
        return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : value.trim();
    }

    /** Romanian convention: "." groups thousands, "," precedes the bani. Bani
     *  are shown only when the amount has them, matching the words beside it. */
    private formatAmount(value: number): string {
        const bani = Math.round(value * 100) % 100;
        const lei = Math.floor(Math.round(value * 100) / 100);
        const grouped = String(lei).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return bani === 0 ? grouped : `${grouped},${String(bani).padStart(2, '0')}`;
    }

    // -----------------------------------------------------------------------
    // Assets
    // -----------------------------------------------------------------------

    private load(): Promise<{ template: Buffer; font: Buffer; map: FieldMap }> {
        if (!this.assets) {
            this.assets = (async () => {
                const templatePath = path.join(__dirname, '..', 'assets', 'itl-054-anexa-2.pdf');
                const mapPath = this.resolveFieldMap();
                const template = fs.readFileSync(templatePath);
                const map = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as FieldMap;
                // Resolved rather than hard-coded so it follows the dependency
                // wherever npm hoists it, including inside a bundled deploy.
                const font = fs.readFileSync(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif.ttf'));
                this.logger.log(`Loaded ITL 054 template and ${Object.keys(map.fields).length} mapped blanks.`);
                return { template, font, map };
            })().catch((err) => {
                // Do not cache a failure: a missing asset is usually a build
                // problem that gets fixed without restarting the process.
                this.assets = null;
                throw err;
            });
        }
        return this.assets;
    }

    /**
     * `field-map.json` lives beside this file in `src/`. `nest build` copies the
     * `assets/` folder into `dist/` but not loose JSON next to the sources, so
     * we look in the places it can plausibly be and say exactly what to fix if
     * it is in none of them.
     */
    private resolveFieldMap(): string {
        const candidates = [
            // ts-node / jest, and any build that copies the file in place.
            path.join(__dirname, 'field-map.json'),
            // If it is ever folded into the asset glob alongside the template.
            path.join(__dirname, '..', 'assets', 'field-map.json'),
            // dist/src/modules/sale-contract/pdf -> back up to the repo root.
            path.join(__dirname, '..', '..', '..', '..', '..', 'src', 'modules', 'sale-contract', 'pdf', 'field-map.json'),
        ];
        const found = candidates.find((candidate) => fs.existsSync(candidate));
        if (found) return found;
        throw new Error(
            'sale-contract field-map.json not found. Add "modules/sale-contract/pdf/*.json" to the assets list in nest-cli.json so the build copies it. ' +
                `Looked in: ${candidates.join(', ')}`,
        );
    }
}
