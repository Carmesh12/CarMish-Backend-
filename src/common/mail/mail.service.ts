import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }) {
    const config = this.getSmtpConfig();
    const secure = config.smtpPort === 465;

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    try {
      await transporter.sendMail({
        from: config.mailFrom,
        to: options.to,
        subject: options.subject,
        text: options.text ?? options.html.replace(/<[^>]*>/g, ''),
        html: options.html,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  private getSmtpConfig() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPortRaw = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const mailFrom = process.env.MAIL_FROM;

    const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : NaN;

    if (
      !smtpHost ||
      !smtpPortRaw ||
      Number.isNaN(smtpPort) ||
      smtpPort <= 0 ||
      !smtpUser ||
      !smtpPass ||
      !mailFrom
    ) {
      throw new InternalServerErrorException(
        'SMTP email service is not configured correctly. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.',
      );
    }

    return { smtpHost, smtpPort, smtpUser, smtpPass, mailFrom };
  }
}
