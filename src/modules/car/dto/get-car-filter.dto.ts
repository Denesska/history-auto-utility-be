import {IsOptional, IsString} from "class-validator";

export class GetCarFilterDto {
    // @IsOptional()
    // @IsEnum(TaskStatus)
    // status?: TaskStatus;

    @IsOptional()
    @IsString()
    search?: string;
}