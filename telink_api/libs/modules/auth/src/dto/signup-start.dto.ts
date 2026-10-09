import { IsEmail, IsString, Matches } from 'class-validator';

export class SignupStartDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'Phone must be in E.164 format, e.g. +21612345678',
  })
  phone!: string;

  @IsEmail()
  email!: string;
}