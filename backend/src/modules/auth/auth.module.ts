import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard, RolesGuard } from './auth.context.js';
import { EmailModule } from '../email/email.module.js';
import { AccessTokenExpiry } from '../../config/environment.js';

@Global()
@Module({
  imports: [
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<AccessTokenExpiry>('JWT_EXPIRY'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, RolesGuard],
  exports: [AuthService, AccessTokenGuard, RolesGuard],
})
export class AuthModule {}
