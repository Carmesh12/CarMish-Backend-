import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SaveWheelEditDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  selectedWheelId!: string;
}
