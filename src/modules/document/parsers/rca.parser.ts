import { DocumentParser, ParseResult } from './document-parser.interface';

// Maps lowercase keyword → canonical display name. Ordered longest-first to avoid substring conflicts.
const KNOWN_INSURERS: [string, string][] = [
    ['allianz-tiriac', 'Allianz-Țiriac'],
    ['allianz tiriac', 'Allianz-Țiriac'],
    ['allianz', 'Allianz'],
    ['euroins', 'Euroins'],
    ['groupama', 'Groupama'],
    ['omniasig', 'Omniasig'],
    ['asirom', 'ASIROM'],
    ['generali', 'Generali'],
    ['uniqa', 'UNIQA'],
    ['signal iduna', 'Signal Iduna'],
    ['signal', 'Signal Iduna'],
    ['ergo', 'ERGO'],
    ['city insurance', 'City Insurance'],
    ['grawe', 'Grawe'],
    ['gothaer', 'Gothaer'],
    ['bulstrad', 'Bulstrad'],
    ['donaris', 'Donaris'],
    ['interamerican', 'Interamerican Hellenic Insurance'],
    ['anytime', 'Anytime (Interamerican)'],
];

// Removes diacritics and lowercases — used only for detection/matching, not for extracted values.
function norm(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')
        .toLowerCase();
}

// Converts Romanian date format DD.MM.YYYY (or DD/MM/YYYY, DD-MM-YYYY) to ISO YYYY-MM-DD.
function toIso(s: string): string {
    const m = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

// Normalizes a Romanian-formatted amount ("1.036,14" / "1036,14" / "1036.14") to a plain "1036.14" numeric string.
function normalizeAmount(raw: string): string {
    let s = raw.replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    return s;
}

const DATE_RO = /\d{2}[.\/-]\d{2}[.\/-]\d{4}/;

export class RcaParser implements DocumentParser {
    canParse(text: string): boolean {
        const n = norm(text);
        return (
            n.includes('rca') ||
            n.includes('raspundere civila') ||
            n.includes('polita de asigurare') ||
            n.includes('certificat de asigurare') ||
            n.includes('green card') ||
            n.includes('carte verde') ||
            n.includes('asigurare obligatorie')
        );
    }

    parse(text: string): ParseResult {
        const n = norm(text);
        const warnings: string[] = [];
        const fields: Record<string, unknown> = {};

        // ── Confidence ───────────────────────────────────────────────────
        let score = 0;
        if (n.includes('rca')) score += 3;
        if (n.includes('raspundere civila')) score += 3;
        if (n.includes('polita de asigurare') || n.includes('certificat de asigurare')) score += 2;
        if (n.includes('prima de asigurare') || n.includes('prima bruta')) score += 1;
        if (n.includes('nr. inmatriculare') || n.includes('numar inmatriculare')) score += 1;
        const confidence: 'high' | 'medium' | 'low' = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';

        // ── Insurer ──────────────────────────────────────────────────────
        for (const [key, label] of KNOWN_INSURERS) {
            if (n.includes(key)) {
                fields.insurer_name = label;
                break;
            }
        }
        if (!fields.insurer_name) warnings.push('Insurer name could not be detected.');

        // ── Policy series + number ───────────────────────────────────────
        // Pattern A: "Seria XX Nr. 123456"
        const seriesNrM = text.match(
            /[Ss]eria\s*[:\-]?\s*([A-Z0-9\/]{1,20})\s+[Nn]r\.?\s*[:\-]?\s*(\d{5,14})/,
        );
        if (seriesNrM) {
            fields.policy_series = seriesNrM[1];
            fields.policy_number = seriesNrM[2];
        } else {
            // Pattern B: "Polița nr. XXXX" or "Nr. poliță: XXXX"
            const policyNrM = text.match(
                /(?:[Pp]oli[tțTȚ][aăAĂ]\s+[Nn]r\.?|[Nn]r\.?\s+poli[tțTȚ][aăAĂ]|[Nn]r\.?\s+contract)\s*[:\-]?\s*([A-Z0-9\/\-]{4,20})/,
            );
            if (policyNrM) fields.policy_number = policyNrM[1];
            else warnings.push('Policy number could not be extracted. Please enter manually.');
        }

        // ── License plate ────────────────────────────────────────────────
        // Try labelled first, fall back to bare plate pattern
        const plateLabelM = text.match(
            /(?:[Nn]r\.?\s+(?:de\s+)?[Îî]nmatriculare|[Nn]um[aă]r\s+[Îî]nmatriculare|[Pp]lac[aă])\s*[:\-]?\s*([A-Z]{1,2}\s*\d{2,3}\s*[A-Z]{2,3})/i,
        );
        if (plateLabelM) {
            fields.plate_number = plateLabelM[1].replace(/\s+/g, '');
        } else {
            // Romanian plate: 1-2 letters + 2-3 digits + 2-3 letters (not at sentence start to avoid false matches)
            const barePlateM = text.match(/\b([A-Z]{1,2}\d{2,3}[A-Z]{2,3})\b/);
            if (barePlateM) fields.plate_number = barePlateM[1];
            else warnings.push('License plate number could not be extracted. Please verify manually.');
        }

        // ── VIN / chassis ────────────────────────────────────────────────
        const vinLabelM = text.match(
            /(?:[Ss]erie\s+[Șș]asiu|VIN|[Nn]r\.?\s+[Ii]dentificare\s+[Vv]ehicul|[Șș]asiu)\s*[:\-]?\s*([A-HJ-NPR-Z0-9]{17})/i,
        );
        if (vinLabelM) {
            fields.vin = vinLabelM[1];
        } else {
            const bareVinM = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
            if (bareVinM) fields.vin = bareVinM[1];
            else warnings.push('VIN/chassis number could not be extracted. Please verify manually.');
        }

        // ── Validity period (from + until) ───────────────────────────────
        // Common contract layout: "Valabilitate Contract de la DD/MM/YYYY până la DD/MM/YYYY"
        const validityRangeM = text.match(
            /[Vv]alabilitate(?:\s+[Cc]ontract)?\s+de\s+la\s+(\d{2}[.\/-]\d{2}[.\/-]\d{4})\s+p[aâ]n[aă]\s+la\s+(\d{2}[.\/-]\d{2}[.\/-]\d{4})/,
        );
        if (validityRangeM) {
            fields.valid_from = toIso(validityRangeM[1]);
            fields.valid_until = toIso(validityRangeM[2]);
        } else {
            const validFromM = text.match(
                /(?:[Vv]alabil[aă]?\s+de\s+la|[Dd]e\s+la\s+data|[Îî]ncep[aâ]nd\s+cu|[Dd]ata\s+[Îî]nceperii|[Dd]ata\s+[Ss]tart)\s*[:\-]?\s*(\d{2}[.\/-]\d{2}[.\/-]\d{4})/,
            );
            if (validFromM) fields.valid_from = toIso(validFromM[1]);
            else warnings.push('Valid from date could not be extracted. Please verify manually.');

            const validUntilM = text.match(
                /(?:[Pp]ân[aă]\s+la|[Vv]alabil[aă]?\s+pân[aă]\s+la|[Dd]ata\s+[Ee]xpir[aă]rii|[Dd]ata\s+[Ss]f[aâ]r[sșŞ]it(?:ului)?|[Dd]ata\s+[Ff]in)\s*[:\-]?\s*(\d{2}[.\/-]\d{2}[.\/-]\d{4})/,
            );
            if (validUntilM) fields.valid_until = toIso(validUntilM[1]);
            else warnings.push('Valid until date could not be extracted. Please verify manually.');
        }

        // ── Issue / emission date ────────────────────────────────────────
        const issueDateM = text.match(
            /(?:[Dd]ata\s+[Ee]miterii|[Dd]ata\s+[Îî]ncheierii|[Ee]mis[aă]?\s+(?:la|în)|[Dd]ata\s+[Ee]liber[aă]rii|[Dd]ata\s+[Dd]ocument)\s*[:\-]?\s*(\d{2}[.\/-]\d{2}[.\/-]\d{4})/,
        );
        if (issueDateM) fields.issue_date = toIso(issueDateM[1]);

        // ── Policyholder / owner / contractant ───────────────────────────
        // Table layout: "Asigurat/ Proprietar" label on its own line, name on the next line.
        const ownerLabelM = text.match(
            /[Aa]sigurat\s*\/\s*(?:[Pp]roprietar|[Cc]ontractant)\s*[\n\r]+\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț\-\.]*(?:[ \t]+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț\-\.]*){1,4})(?=[ \t]*[\n\r])/,
        );
        if (ownerLabelM) {
            fields.policyholder_name = ownerLabelM[1].trim();
            fields.owner_name = ownerLabelM[1].trim();
        } else {
            const holderM = text.match(
                /(?:[Aa]sigurat[ul]?|[Tt]itutar[ul]?\s+[Pp]oli[tț][ei]?|[Pp]ersoan[aă]\s+[Aa]sigurat[aă]|[Cc]ontractant)\s*[:\-]?\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț\-\.]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț\-\.]+){1,4})/,
            );
            if (holderM) fields.policyholder_name = holderM[1].trim();
            else warnings.push('Policyholder name could not be extracted. Please enter manually.');
        }

        // ── Broker / agent ────────────────────────────────────────────────
        const brokerM = text.match(
            /[Ss]ucursala\s*\/\s*[Aa]gen[țţ]ia\s*[\n\r]+\s*([A-ZĂÂÎȘȚ][\s\S]{5,90}?)(?=\s*Cod\s*[A-Z]{2,6}\d{2,8})/,
        );
        if (brokerM) fields.broker_name = brokerM[1].replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

        // ── CNP (Romanian personal ID — 13 digits) ───────────────────────
        const cnpLabelM = text.match(/(?:CNP|C\.N\.P\.)\s*[:\-]?\s*(\d{13})/);
        if (cnpLabelM) {
            fields.owner_cnp = cnpLabelM[1];
        } else {
            // Bare 13-digit number starting with 1-8 (characteristic of Romanian CNP)
            const bareCnpM = text.match(/\b([1-8]\d{12})\b/);
            if (bareCnpM) fields.owner_cnp = bareCnpM[1];
        }

        // ── Vehicle make / model / category ───────────────────────────────
        // Table layout: "Fel, Tip, Marcă, Model Vehicul:" header followed by "A,Autoturism,BMW,318".
        const vehicleComboM = text.match(
            /Fel\s*,\s*Tip\s*,\s*Marc[aă]\s*,\s*Model\s*[\n\r]+\s*Vehicul\s*:?\s*[\n\r]*\s*([A-Z][0-9]?)\s*,\s*([^,\n\r]+)\s*,\s*([^,\n\r]+)\s*,\s*([^,\n\r]+)/,
        );
        if (vehicleComboM) {
            fields.vehicle_category = vehicleComboM[1].trim();
            fields.vehicle_make = vehicleComboM[3].trim();
            fields.vehicle_model = vehicleComboM[4].trim();
        } else {
            // "Marca vehiculului" / "Model vehicul" are column labels, not values — skip those.
            const makeM = text.match(
                /[Mm]arc[aă](?!\s+[Vv]ehicul)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\-\s]{0,20}?)(?=\s*[\n\r]|\s{2,}|\s*[Mm]odel|\s*[Tt]ip|\s*[Aa]n\b)/,
            );
            if (makeM) fields.vehicle_make = makeM[1].trim();

            const modelM = text.match(
                /[Mm]odel(?!\s+[Vv]ehicul)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s\-\.]{0,30}?)(?=\s*[\n\r]|\s{2,}|\s*[Aa]n\b|\s*[Cc]ategorie|\s*[Cc]arburant)/,
            );
            if (modelM) fields.vehicle_model = modelM[1].trim();

            const catM = text.match(/[Cc]ategorie\s*(?:[Vv]ehicul)?\s*[:\-]?\s*([A-Z][1-9]?)\b/);
            if (catM) fields.vehicle_category = catM[1];
        }

        // ── Engine capacity / power ───────────────────────────────────────
        // Table layout: "Capacitate cilindrică / Putere: 1795 /85" (cc / kW, no units shown).
        const engPowerComboM = text.match(
            /[Cc]apacitate\s+[Cc]ilindric[aă]\s*\/\s*[Pp]utere\s*:?\s*(\d+)\s*\/\s*(\d+)/,
        );
        if (engPowerComboM) {
            fields.engine_capacity = `${engPowerComboM[1]} cc`;
            fields.power = `${engPowerComboM[2]} kW`;
        } else {
            const engM = text.match(
                /(?:[Cc]apacitate\s+[Cc]ilindric[aă]|[Cc]apacitate\s+[Mm]otor|[Cc]ilindree)\s*[:\-]?\s*(\d+)\s*(?:cm[²2]?|cc)/i,
            );
            if (engM) fields.engine_capacity = `${engM[1]} cc`;

            const powerM = text.match(/[Pp]utere\s*[:\-]?\s*(\d+)\s*(?:kW|KW)/);
            if (powerM) fields.power = `${powerM[1]} kW`;
        }

        // ── Number of seats / max authorized weight ───────────────────────
        // Table layout: "Nr. locuri/masă totală maximă autorizată: 4 / 1810"
        const seatsWeightM = text.match(
            /[Nn]r\.?\s*[Ll]ocuri\s*\/\s*mas[aă]\s+total[aă]\s+maxim[aă]\s+autorizat[aă]\s*:?\s*(\d+)\s*\/\s*(\d+)/,
        );
        if (seatsWeightM) {
            fields.seats = seatsWeightM[1];
            fields.max_weight = seatsWeightM[2];
        } else {
            const seatsM = text.match(/(?:[Nn]r\.?\s+[Ll]ocuri|[Ll]ocuri)\s*[:\-]?\s*(\d+)/);
            if (seatsM) fields.seats = seatsM[1];
        }

        // ── Insurance premium ─────────────────────────────────────────────
        // Romanian amounts use "." as thousands separator and "," as decimal separator (e.g. "1.036,14").
        const AMOUNT_WITH_CURRENCY = '([\\d][\\d.,\\s]{0,14}\\d)\\s*(RON|EUR|USD|lei)\\b';
        const premiumM = text.match(
            new RegExp(`[Pp]rim[aă]\\s*(?:de\\s+[Aa]sigurare|[Bb]rut[aă])?\\s*[:\\-]?\\s*${AMOUNT_WITH_CURRENCY}`, 'i'),
        );
        const totalM = !premiumM
            ? text.match(new RegExp(`[Tt]otal\\s+(?:de\\s+)?plat[aă]\\s*[:\\-]?\\s*${AMOUNT_WITH_CURRENCY}`, 'i'))
            : null;
        const amountM = premiumM ?? totalM;
        if (amountM) {
            fields.premium = normalizeAmount(amountM[1]);
            fields.currency = amountM[2].toLowerCase() === 'lei' ? 'RON' : amountM[2].toUpperCase();
        } else {
            if (/\bRON\b/.test(text)) fields.currency = 'RON';
            else if (/\bEUR\b/.test(text)) fields.currency = 'EUR';
            warnings.push('Insurance premium amount could not be extracted. Please enter manually.');
        }

        // ── Bonus-malus class ────────────────────────────────────────────
        const bmM = text.match(/[Bb]onus[-\s]?[Mm]alus\s*[:\-]?\s*([B][0-9]|M[0-9]|[A-Z][0-9]?)\b/);
        if (bmM) fields.bonus_malus_class = bmM[1];

        // ── Direct settlement ────────────────────────────────────────────
        if (/[Dd]econtare\s+[Dd]irect[aă]?|[Dd]econtare\s+[Dd]irecta/i.test(text)) {
            fields.direct_settlement = true;
            const dsPriceM = text.match(
                /[Dd]econtare\s+[Dd]irect[aă]?\s*[:\-]?\s*([\d\s.,]+)\s*(RON|EUR)/i,
            );
            if (dsPriceM) fields.direct_settlement_price = `${dsPriceM[1].trim()} ${dsPriceM[2]}`;
        } else {
            fields.direct_settlement = false;
        }

        // ── Damage limits ────────────────────────────────────────────────
        // RCA contracts typically list two limits: "Limita de despăgubire pentru <type>: <amount> RON"
        const limitMatches = [
            ...text.matchAll(
                /[Ll]imit[aă]\s+(?:de\s+)?[Dd]esp[aă]gubire\s+pentru\s+([^:\n\r]{3,60}?)\s*:\s*([\d][\d.,\s]{2,15}\d\s*(?:RON|EUR))/gi,
            ),
        ];
        if (limitMatches.length) {
            fields.damage_limits = limitMatches
                .map(m => `${m[1].replace(/\s+/g, ' ').trim()}: ${m[2].replace(/\s+/g, ' ').trim()}`)
                .join(' / ');
        } else {
            const limitsM = text.match(
                /(?:[Ll]imit[eaă]\s+(?:de\s+)?[Dd]esp[aă]gubire|[Ll]imit[aă]\s+[Mm]axim[aă]|[Dd]esp[aă]gubire\s+[Mm]axim[aă])\s*[:\-]?\s*([\d\s.,]+(?:RON|EUR)?(?:\s*\/\s*[\d\s.,]+(?:RON|EUR)?)?)/i,
            );
            if (limitsM) fields.damage_limits = limitsM[1].trim();
        }

        return { detected: true, document_type: 'RCA', confidence, fields: fields as any, warnings };
    }
}
