import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerification(email: string, name: string, token: string): Promise<void> {
    await this.send(
      email,
      'Verify your Northstar email',
      `Hi ${name}, verify your email: ${this.frontendLink('verify', token)}`,
      token,
    );
  }

  async sendPasswordReset(email: string, name: string, token: string): Promise<void> {
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
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Development-only email to ${recipient}: ${text} [token: ${developmentToken}]`);
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Production email delivery is not configured (RESEND_API_KEY and EMAIL_FROM)',
      );
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [recipient], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.error(`Email provider rejected delivery (${response.status})`);
      throw new ServiceUnavailableException('Unable to deliver account email');
    }
  }

  private frontendLink(action: string, token: string): string {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    return `${frontendUrl.replace(/\/+$/, '')}/#${action}=${encodeURIComponent(token)}`;
  }
}
