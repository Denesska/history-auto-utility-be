/**
 * The single prompt both identity-extraction providers send, plus the JSON
 * schema the answer must match.
 *
 * It is deliberately shared: the whole point of having two adapters is to A/B
 * the same instructions against two vendors on the same photo, so any wording
 * difference would make the comparison meaningless.
 *
 * Style follows src/modules/document/gemini-extraction.service.ts — describe the
 * document, name the fields, and say explicitly that a field that cannot be read
 * is left out rather than guessed.
 */

export const IDENTITY_EXTRACTION_PROMPT = `You are analysing a photo or scan of a Romanian identity document ("carte de identitate", "buletin", "CI"). It may be either:
- the older laminated card (blue/green, printed "ROMANIA / CARTE DE IDENTITATE"), or
- the newer electronic identity card ("carte electronica de identitate", "CEI"), which carries a chip and an MRZ (machine-readable zone) at the bottom.
Both sides may be visible in the same image. If both are visible, use every side you can read.

If the image is not a Romanian identity document (for example a driving licence, a passport, a vehicle document, or an unrelated photo), or it is too blurred/cropped to read at all, set "detected" to false, leave "fields" empty and explain why in "warnings".

Extract every field you can clearly read into "fields". Leave a field out entirely if it is not visible, not legible, or not present on this card. Do not guess, do not infer, do not invent, and do not complete a partially visible value from context — a missing field is always better than a wrong one.

FIELDS

- "last_name" — the surname, printed after the label "Nume" (on the MRZ it is the part before the "<<" separator).
- "first_name" — the given name(s), printed after the label "Prenume". The card prints "Nume" first and "Prenume" second; never swap them. A person may have several given names — keep them all, in the printed order, in "first_name".
- "cnp" — the personal numeric code, printed after the label "CNP". Exactly 13 digits, no spaces. Read every digit individually; a single wrong digit invalidates it.
- "id_series" — the label "Seria" (older card) or "Serie" (electronic card). Exactly TWO letters, e.g. "XH", "RD", "TZ". Return the letters only, uppercase, without the number.
- "id_number" — the label "Nr.". Exactly SIX digits. Return the digits only, without the series letters. Series and number are printed next to each other but the contract needs them in separate blanks, so never merge them into one value.
- "issued_by" — the issuing authority, printed after "emisa de" / "emisă de" (e.g. "SPCLEP Cluj-Napoca", "Politia Sector 3").
- "issue_date" — the start of validity ("Valabilitate" / "valabila de la"). On many cards the validity is printed as a range "dd.mm.yy-dd.mm.yy"; the first date is the issue date.
- "valid_until" — the end of validity; on a range, the second date.
- "nationality" — "Cetatenie" / "Cetăţenie", usually "Romana"/"Română".
- "place_of_birth" — "Loc naştere" / "Locul naşterii", as printed.

ADDRESS ("Domiciliu")

The address block labelled "Domiciliu" is one line on the card but the contract has a separate blank for each part, so decompose it into "address":
- "county" — after "Jud." (judeţ). For Bucharest the card prints "Mun.Bucuresti" with a sector instead of a county; in that case leave "county" out and put "Bucuresti" in "city".
- "city" — the municipality/town/commune: after "Mun." (municipiu), "Or." / "Oras" (oraş) or "Com." (comuna).
- "village_or_sector" — after "Sat." (sat) or "Sect."/"Sector" for Bucharest sectors. Return the sector as printed, e.g. "Sector 3".
- "street" — after "Str." (strada), "B-dul"/"Bd." (bulevardul), "Cal." (calea), "Ale." (aleea), "Sos." (şoseaua), "Int." (intrarea), "Pta." (piaţa). Include the street type word together with the name, e.g. "Str. Mihai Viteazu", "B-dul Unirii".
- "street_number" — after "Nr." inside the address block. This is the house number and is NOT the same as the card's "Nr." (document number) — do not confuse the two.
- "building" — after "Bl." (bloc).
- "staircase" — after "Sc." (scara).
- "floor" — after "Et." (etaj).
- "apartment" — after "Ap." (apartament).
- "postal_code" — only if a postal code is actually printed.
Leave "country" out; the document is Romanian and the form assumes Romania. Any address part the card does not print must be left out — most addresses have no "Sc." or "Et." at all.

FORMATTING

- Dates must be ISO 8601 (YYYY-MM-DD). Romanian cards print dd.mm.yyyy or dd.mm.yy. Expand a two-digit year to the 20xx/19xx that makes sense for an identity card (issue and expiry dates are never more than ~10 years apart). If you cannot tell which century a two-digit year means, leave the date out.
- Names, addresses and the issuing authority: copy them exactly as printed, keeping the printed diacritics if you can read them. Do not translate, do not reorder, do not expand abbreviations other than into the address fields above.
- "cnp", "id_series" and "id_number" must contain no spaces and no punctuation.

CONFIDENCE

Set "confidence" to:
- "high" only when the card is sharp, evenly lit and you read the CNP, the series and the number digit by digit without hesitation;
- "medium" when the card is legible but glare, blur, a fold or a worn print made one or more characters a judgement call;
- "low" when a large part of the card is hard to read, when you only had one partially visible side, or when the photo is at a steep angle.
A worn, scratched or glare-covered card is common — prefer "medium"/"low" and a warning over a confident guess.

WARNINGS

List in "warnings" every field an identity card normally has that you could not read confidently, plus anything the user should re-check. Warnings are shown directly to the user, so write them in ROMANIAN, short, and addressed to the user, e.g.:
- "CNP-ul nu a putut fi citit. Completeaza-l manual."
- "Seria si numarul actului sunt neclare. Verifica-le."
- "Adresa este partial acoperita de reflexie. Verifica strada si numarul."
Do not put any extracted value inside a warning.`;

/**
 * JSON schema for the provider response.
 *
 * Only the four envelope keys are required: every individual field stays
 * optional so the model can honour "leave it out rather than guess".
 * `additionalProperties: false` everywhere is required by Anthropic structured
 * outputs and also keeps the Cloudflare adapter's validation honest.
 */
export const IDENTITY_RESPONSE_JSON_SCHEMA = {
    type: 'object',
    properties: {
        detected: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        fields: {
            type: 'object',
            properties: {
                last_name: { type: 'string' },
                first_name: { type: 'string' },
                cnp: { type: 'string' },
                id_series: { type: 'string' },
                id_number: { type: 'string' },
                issued_by: { type: 'string' },
                issue_date: { type: 'string' },
                valid_until: { type: 'string' },
                nationality: { type: 'string' },
                place_of_birth: { type: 'string' },
                address: {
                    type: 'object',
                    properties: {
                        county: { type: 'string' },
                        postal_code: { type: 'string' },
                        city: { type: 'string' },
                        village_or_sector: { type: 'string' },
                        street: { type: 'string' },
                        street_number: { type: 'string' },
                        building: { type: 'string' },
                        staircase: { type: 'string' },
                        floor: { type: 'string' },
                        apartment: { type: 'string' },
                    },
                    additionalProperties: false,
                },
            },
            additionalProperties: false,
        },
        warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['detected', 'confidence', 'fields', 'warnings'],
    additionalProperties: false,
} as const;

/**
 * A compact, human-readable rendering of the same contract, appended to the
 * prompt for providers that cannot enforce a schema server-side (Cloudflare).
 */
export const IDENTITY_JSON_CONTRACT_HINT = `
OUTPUT

Reply with a single JSON object and nothing else — no explanation before it, no markdown code fence around it:
{"detected": true|false, "confidence": "high"|"medium"|"low", "fields": {"last_name": "...", "first_name": "...", "cnp": "...", "id_series": "...", "id_number": "...", "issued_by": "...", "issue_date": "YYYY-MM-DD", "valid_until": "YYYY-MM-DD", "nationality": "...", "place_of_birth": "...", "address": {"county": "...", "city": "...", "village_or_sector": "...", "street": "...", "street_number": "...", "building": "...", "staircase": "...", "floor": "...", "apartment": "...", "postal_code": "..."}}, "warnings": ["..."]}
Omit any key you cannot fill. Use no other keys.`;
