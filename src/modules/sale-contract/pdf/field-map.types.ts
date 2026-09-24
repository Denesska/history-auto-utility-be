/**
 * Shape of `field-map.json`, the generated coordinate table that tells the PDF
 * filler where every blank of ITL 054 / Anexa nr. 2 sits.
 *
 * The map is produced once by `build-field-map.ts` and committed; the service
 * only reads it. Re-parsing the template on every request would cost ~200ms of
 * pdf.js work for a document whose geometry is frozen by law.
 */

/** One dotted blank on the form, ready to be stamped over. */
export interface FieldMapEntry {
    /** Left edge of the dotted run, in PDF points from the page's left edge. */
    x: number;
    /** Baseline of the dotted run, in PDF points from the page's bottom edge. */
    y: number;
    /** How much horizontal room the value may occupy before it hits the next
     *  printed word. Already shrunk by a safety margin by the generator. */
    width: number;
    /** Font size to draw at. Derived from the template's own size, reduced a
     *  notch because DejaVu Serif runs wider than the form's Times New Roman. */
    size: number;
    /** The form's printed text around the blank, kept for humans reviewing the
     *  map and for the verification script's "did it land on the right line?"
     *  assertions. Never rendered. */
    label: string;
}

/** A tick mark — the form has no AcroForm widgets, so we stamp an "X". */
export interface MarkMapEntry {
    x: number;
    y: number;
    size: number;
    label: string;
}

export interface FieldMap {
    /** Which template this was generated from, so a swapped PDF is noticed. */
    source: string;
    generatedAt: string;
    page: { width: number; height: number };
    /** Blanks we fill, keyed by a dotted path into `SaleContractPdfData`. */
    fields: Record<string, FieldMapEntry>;
    /** Checkbox-like marks: original/copy and the annexes yes/no pair. */
    marks: Record<string, MarkMapEntry>;
    /** Blanks deliberately left empty (tax-authority cartuşe, signatures),
     *  recorded so that a future reader can see they were seen and skipped. */
    unmapped: Array<{ y: number; run: number; label: string; reason: string }>;
}
