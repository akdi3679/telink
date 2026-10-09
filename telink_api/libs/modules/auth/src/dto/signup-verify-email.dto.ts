import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class SignupVerifyEmailDto {
  @IsUUID()
  signupId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^[0-9]{6}$/)
  code!: string;
}