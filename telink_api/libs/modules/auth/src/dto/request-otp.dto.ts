import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  @Matches(/^\+?[0-9]+$/, {
    message: 'Phone must be digits, optionally starting with +',
  })
  phone!: string;
}