import {IsString, IsInt, IsDate, IsNumber, IsEnum} from 'class-validator';
import {ApiProperty} from "@nestjs/swagger";
import {ServiceType} from "../../document/enum/service-type.enum";
import {ServiceCategory} from "../../document/enum/service-category.enum";

export class CreateMaintenanceRecordDto {
    @IsInt()
    @ApiProperty({ example: '123' })
    readonly car_id: number;

    @IsDate()
    @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
    readonly service_date: Date;

    @IsInt()
    @ApiProperty({ example: '380000' })
    readonly mileage: number;

    @IsString()
    @ApiProperty({ example: 'Oil 10W40, air filter MANN' })
    readonly description: string;

    @ApiProperty({ example: 'MAINTENANCE', enum: ServiceType })
    @IsEnum(ServiceType)
    readonly service_type: ServiceType;

    @ApiProperty({ example: 'OIL_CHANGE', enum: ServiceCategory })
    @IsEnum(ServiceCategory)
    readonly service_category: ServiceCategory;

    @IsNumber()
    @ApiProperty({ example: 'Insurance' })
    readonly cost: number;

    @IsDate()
    @ApiProperty({ example: 'Insurance' })
    readonly expiry_date: Date;
}
