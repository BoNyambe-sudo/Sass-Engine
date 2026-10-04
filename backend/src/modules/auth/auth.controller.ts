import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AccessTokenGuard, CurrentAuth, AuthContext } from './auth.context.js';
import {
  AcceptInvitationDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

const refreshCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: Number(process.env.JWT_REFRESH_DAYS ?? 7) * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signup(
      dto.email,
      dto.name,
      dto.password,
      dto.organizationName ?? `${dto.name}'s workspace`,
    );
    return this.withRefreshCookie(result, response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    return this.withRefreshCookie(result, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(request.cookies?.refresh_token);
    return this.withRefreshCookie(result, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.cookies?.refresh_token);
    response.clearCookie('refresh_token', { ...refreshCookie, maxAge: undefined });
    return { message: 'Signed out.' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: TokenDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('accept-invitation')
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.acceptInvitation(
      dto.token,
      dto.name,
      dto.password,
    );
    return this.withRefreshCookie(result, response);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentAuth() auth: AuthContext) {
    return { userId: auth.userId, email: auth.email, organizationId: auth.organizationId, role: auth.role };
  }

  private withRefreshCookie(
    result: {
      refreshToken: string;
      verificationToken?: string;
      invitationToken?: string;
      [key: string]: unknown;
    },
    response: Response,
  ) {
    response.cookie('refresh_token', result.refreshToken, refreshCookie);
    const { refreshToken: _refreshToken, verificationToken, invitationToken, ...safe } = result;
    return {
      ...safe,
      ...(verificationToken ? { verificationToken } : {}),
      ...(invitationToken ? { invitationToken } : {}),
    };
  }
}
