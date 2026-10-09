import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  @Matches(/^\+?[0-9]+$/, {
    message: 'Phone must be digits, optionally starting with +',
  })
  phone!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code!: string;
}