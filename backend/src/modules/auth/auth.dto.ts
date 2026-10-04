import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  name!: string;

  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  organizationName?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @MinLength(12)
  password!: string;
}

export class AcceptInvitationDto extends TokenDto {
  @MinLength(12)
  password!: string;

  @Length(1, 120)
  name!: string;
}

export class InviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['ADMIN', 'MANAGER', 'VIEWER'])
  role!: 'ADMIN' | 'MANAGER' | 'VIEWER';
}

export class ChangeRoleDto {
  @IsIn(['ADMIN', 'MANAGER', 'VIEWER'])
  role!: 'ADMIN' | 'MANAGER' | 'VIEWER';
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;
}
