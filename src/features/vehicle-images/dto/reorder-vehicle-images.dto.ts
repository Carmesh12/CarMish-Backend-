import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderVehicleImagesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  imageIds: string[];
}
