import {
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLES } from '../auth.constants';

export class SignupCompleteDto {
  @IsString()
  signupToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message: 'Password must be at least 8 characters and contain a letter and a number',
  })
  password!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsString()
  @IsIn(ROLES as unknown as string[])
  role!: string;

  @IsString()
  @Length(1, 100)
  jobTitle!: string;
}