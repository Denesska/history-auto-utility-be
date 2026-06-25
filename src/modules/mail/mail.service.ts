import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailLang } from './templates/base-email.template';
import { CarShareInvitationData, carShareInvitationEmail } from './templates/car-share-invitation.template';
import { DocumentExpiringData, documentExpiringEmail } from './templates/document-expiring.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.configService.get<string>('SMTP_PORT', '587')),
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    });
    this.from = this.configService.getOrThrow<string>('MAIL_FROM');
  }

  /** Generic low-level send — every notification email goes through this. */
  private async sendMail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async sendCarShareInvitation(to: string, lang: MailLang, data: CarShareInvitationData): Promise<void> {
    const { subject, html } = carShareInvitationEmail(lang, data);
    await this.sendMail(to, subject, html);
  }

  async sendDocumentExpiring(to: string, lang: MailLang, data: DocumentExpiringData): Promise<void> {
    const { subject, html } = documentExpiringEmail(lang, data);
    await this.sendMail(to, subject, html);
  }
}
