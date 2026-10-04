import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  signup(email: string, name: string) {
    const user = {
      id: `user_${Date.now()}`,
      email,
      name,
      role: 'ADMIN',
      organizationId: 'org_default',
      isEmailVerified: true,
    };

    return {
      user,
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
      refreshToken: this.jwtService.sign(
        { sub: user.id, type: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret', expiresIn: process.env.JWT_REFRESH_EXPIRY ?? '7d' },
      ),
    };
  }

  login(email: string, password: string) {
    if (!email || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = {
      id: 'user_demo',
      email,
      name: 'Demo Admin',
      role: 'ADMIN',
      organizationId: 'org_demo',
      isEmailVerified: true,
    };

    return {
      user,
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
      refreshToken: this.jwtService.sign(
        { sub: user.id, type: 'refresh' },
        { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret', expiresIn: process.env.JWT_REFRESH_EXPIRY ?? '7d' },
      ),
    };
  }

  forgotPassword(email: string) {
    return {
      message: `Password reset instructions sent to ${email}`,
      resetToken: 'mock-reset-token',
    };
  }

  verifyEmail(email: string) {
    return {
      message: `Email verified for ${email}`,
      verified: true,
    };
  }
}
