import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty()
  @IsString()
  email!: string;
}
