import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not set - emails will only log in development',
      );
    }
    this.resend = new Resend(apiKey ?? 'placeholder');
  }

  async sendVerification(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    await this.send(
      email,
      'Verify your Northstar email',
      `Hi ${name}, verify your email: ${this.frontendLink('verify', token)}`,
      token,
    );
  }

  async sendPasswordReset(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    await this.send(
      email,
      'Reset your Northstar password',
      `Hi ${name}, reset your password: ${this.frontendLink('reset', token)}`,
      token,
    );
  }

  async sendInvitation(email: string, token: string): Promise<void> {
    await this.send(
      email,
      'You have been invited to Northstar',
      `Accept your workspace invitation: ${this.frontendLink('invite', token)}`,
      token,
    );
  }

  private async send(
    recipient: string,
    subject: string,
    text: string,
    developmentToken: string,
  ): Promise<void> {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured (EMAIL_FROM)',
      );
    }
    const { error } = await this.resend.emails.send({
      from,
      to: ['franknyambe213@gmail.com'],
      subject,
      text,
    });
    if (error) {
      this.logger.error(`Email provider rejected delivery: ${error.message}`);
      throw new ServiceUnavailableException('Unable to deliver account email');
    }
  }

  private frontendLink(action: string, token: string): string {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    return `${frontendUrl.replace(/\/+$/, '')}/#${action}=${encodeURIComponent(token)}`;
  }
}
