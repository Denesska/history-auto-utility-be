import { Document } from '@prisma/client';

export class DocumentEntity implements Document {
    id: number;
    document_type: string;
    car_id: number;
    issue_date: Date | null;
    expiry_date: Date | null;
    provider: string | null;
    policy_series: string | null;
    policy_number: string | null;
    premium: number | null;
    currency: string | null;
    bonus_malus_class: string | null;
    status: string | null;
    policyholder: string | null;
    cnp_id: string | null;
    file_url: string | null;
    file_name: string | null;
    file_size: number | null;
}
