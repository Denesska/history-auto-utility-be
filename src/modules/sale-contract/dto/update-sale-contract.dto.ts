import { PartialType } from '@nestjs/mapped-types';
import { CreateSaleContractDto } from './create-sale-contract.dto';

export class UpdateSaleContractDto extends PartialType(CreateSaleContractDto) {}
