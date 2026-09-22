/**
 * Shared shapes for the sale-contract feature (ITL 054, Anexa nr. 2).
 *
 * Every name here mirrors a blank on the official form, so that the PDF filler,
 * the extraction layer and the API all talk about the same thing. Where the form
 * is ambiguous the Romanian label is quoted in a comment.
 */

/** A postal address as the form breaks it down — used for both the home/registered
 *  address ("domiciliul/sediul") and the separate fiscal domicile. */
export interface ContractAddress {
    /** Left blank for Romania; the form reads "în ROMÂNIA/ ......" for anything else. */
    country?: string;
    county?: string;
    postal_code?: string;
    /** "municipiul/oraşul/comuna" */
    city?: string;
    /** "satul/sectorul" */
    village_or_sector?: string;
    street?: string;
    street_number?: string;
    building?: string;
    staircase?: string;
    floor?: string;
    apartment?: string;
}

/** The legal representative of a company party ("reprezentată prin"). */
export interface ContractRepresentative {
    full_name?: string;
    id_series?: string;
    id_number?: string;
    cif?: string;
    phone?: string;
    email?: string;
}

/**
 * One party to the contract — section (1) "persoana care înstrăinează" or
 * section (2) "persoana care dobândeşte".
 *
 * This is the payload that gets AES-256-GCM encrypted into
 * `SaleContractParty.data_encrypted`. It must never be logged, never leave the
 * service layer unencrypted except towards the PDF filler and the owning user,
 * and never be persisted field-by-field.
 */
export interface ContractPartyData {
    is_company: boolean;
    /** "Subsemnatul(a)" for a person, "Subscrisa" for a company. */
    full_name?: string;
    address?: ContractAddress;
    /** B.I./C.I./C.I.P./Paşaport */
    id_series?: string;
    id_number?: string;
    /** CNP for a person, CIF for a company — the form shares one blank. */
    cnp_or_cif?: string;
    phone?: string;
    email?: string;
    /** "şi domiciliul fiscal în ..." — only filled when it differs. */
    fiscal_address?: ContractAddress;
    representative?: ContractRepresentative;
    /** "în calitate de ..." — e.g. owner, heir, administrator. */
    capacity?: string;
}

/** Section (3), "obiectul contractului". Not personal data, stored in columns. */
export interface ContractVehicleData {
    make?: string;
    /** "tipul" — the type/variant as printed on the registration certificate. */
    type?: string;
    /** "număr de identificare" — the VIN. */
    vin?: string;
    engine_series?: string;
    engine_capacity_cm3?: number;
    /** Trailers/semi-trailers only. */
    max_weight_tons?: number;
    license_plate?: string;
    itp_expiry_date?: string;
    /** "numărul cărţii de identitate a vehiculului" (CIV). */
    civ_number?: string;
    manufacture_year?: number;
    euro_norm?: string;
    /** When the seller acquired it, and under what document. */
    acquired_date?: string;
    acquired_document?: string;
}

/** Everything the PDF filler needs to produce a finished contract. */
export interface SaleContractPdfData {
    seller: ContractPartyData;
    buyer: ContractPartyData;
    vehicle: ContractVehicleData;
    price_lei?: number;
    /** "în litere" — generated from the figure, not typed by the user. */
    price_in_words?: string;
    signing_date?: string;
    signing_place?: string;
    /** "Anexe la contract: Da / Nu" */
    has_annexes?: boolean;
}

// ---------------------------------------------------------------------------
// Identity-document extraction
// ---------------------------------------------------------------------------

/**
 * Fields we try to read off a Romanian identity document (CI / buletin).
 * Everything is optional: a field we cannot read confidently is left out rather
 * than guessed, exactly as the existing document extractor does.
 */
export interface IdentityDocumentFields {
    last_name?: string;
    first_name?: string;
    /** Convenience: last + first, in the order the contract wants them. */
    full_name?: string;
    cnp?: string;
    /** "seria" — two letters, e.g. "XH". */
    id_series?: string;
    /** "nr." — six digits. */
    id_number?: string;
    address?: ContractAddress;
    /** "emisă de" */
    issued_by?: string;
    issue_date?: string;
    valid_until?: string;
    nationality?: string;
    place_of_birth?: string;
}

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface IdentityExtractionResult {
    detected: boolean;
    confidence: ExtractionConfidence;
    fields: IdentityDocumentFields;
    /** End-user phrased, e.g. "CNP-ul nu a putut fi citit. Completează-l manual." */
    warnings: string[];
    /** Which provider produced this, for A/B comparison. Never a secret. */
    provider: string;
}

/**
 * Implemented once per AI vendor. The provider is chosen at runtime from
 * IDENTITY_EXTRACTION_PROVIDER so the paid vendor used for identity documents
 * stays independent of the free Gemini tier the rest of the app runs on.
 */
export interface IdentityExtractionProvider {
    /** Stable id, matched against IDENTITY_EXTRACTION_PROVIDER. */
    readonly name: string;
    /** False when the provider's key isn't configured — treated as "disabled",
     *  never as a startup failure, matching GeminiExtractionService. */
    isConfigured(): boolean;
    extract(image: Buffer, mimeType: string): Promise<IdentityExtractionResult | null>;
}

/** Thrown when the chosen vendor is reachable but overloaded, so the API can
 *  answer 503 instead of pretending the document was unreadable. */
export class IdentityExtractionUnavailableError extends Error {
    constructor(provider: string) {
        super(`Identity extraction provider "${provider}" is temporarily unavailable.`);
        this.name = 'IdentityExtractionUnavailableError';
    }
}
