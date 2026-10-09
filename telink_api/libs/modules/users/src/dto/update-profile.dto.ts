import {
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workCompany?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  photoUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  bannerUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}