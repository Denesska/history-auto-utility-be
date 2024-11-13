import { Document } from '@prisma/client';

export class DocumentEntity implements Document {
    id: number;
    document_type: string;
    issue_date: Date;
    expiry_date: Date;
    car_id: number;
}
