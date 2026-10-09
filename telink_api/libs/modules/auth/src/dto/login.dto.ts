import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  // Phone (E.164) or email — service detects which.
  @IsString()
  @MinLength(3)
  identifier!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}