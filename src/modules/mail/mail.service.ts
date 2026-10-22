import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailLang } from './templates/base-email.template';
import { CarShareInvitationData, carShareInvitationEmail } from './templates/car-share-invitation.template';
import { DocumentExpiringData, documentExpiringEmail } from './templates/document-expiring.template';
import { MaintenanceDueData, maintenanceDueEmail } from './templates/maintenance-due.template';
import { OrganizationInvitationData, organizationInvitationExistingUserEmail } from './templates/organization-invitation.template';
import { BusinessAccessRequestedData, businessAccessRequestedEmail } from './templates/business-access-request.template';
import {
  BusinessAccessApprovedData,
  BusinessAccessRejectedData,
  businessAccessApprovedEmail,
  businessAccessRejectedEmail,
} from './templates/business-access-decision.template';

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
  private async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${(error as Error).message}`, (error as Error).stack);
      return false;
    }
  }

  async sendCarShareInvitation(to: string, lang: MailLang, data: CarShareInvitationData): Promise<void> {
    const { subject, html } = carShareInvitationEmail(lang, data);
    await this.sendMail(to, subject, html);
  }

  /** Resolves to whether the email was actually handed to the SMTP server (sendMail never throws). */
  async sendDocumentExpiring(to: string, lang: MailLang, data: DocumentExpiringData): Promise<boolean> {
    const { subject, html } = documentExpiringEmail(lang, data);
    return this.sendMail(to, subject, html);
  }

  /** Resolves to whether the email was actually handed to the SMTP server (sendMail never throws). */
  async sendMaintenanceDue(to: string, lang: MailLang, data: MaintenanceDueData & { appUrl: string }): Promise<boolean> {
    const { subject, html } = maintenanceDueEmail(lang, data);
    return this.sendMail(to, subject, html);
  }

  /**
   * Only the "you already have an account" variant exists so far — inviting an
   * email with no HAU App account yet isn't supported by OrganizationService
   * (it requires a registered user to invite), so there's no "here's what's
   * happening and where to get the app" variant to send yet. Tracked in
   * B2B-STRATEGY.md.
   */
  async sendOrganizationInvitation(to: string, lang: MailLang, data: OrganizationInvitationData): Promise<void> {
    const { subject, html } = organizationInvitationExistingUserEmail(lang, data);
    await this.sendMail(to, subject, html);
  }

  /** Admin alert: a user requested to be allowed to create an organization. */
  async sendBusinessAccessRequested(to: string, lang: MailLang, data: BusinessAccessRequestedData): Promise<void> {
    const { subject, html } = businessAccessRequestedEmail(lang, data);
    await this.sendMail(to, subject, html);
  }

  async sendBusinessAccessApproved(to: string, lang: MailLang, data: BusinessAccessApprovedData): Promise<void> {
    const { subject, html } = businessAccessApprovedEmail(lang, data);
    await this.sendMail(to, subject, html);
  }

  async sendBusinessAccessRejected(to: string, lang: MailLang, data: BusinessAccessRejectedData): Promise<void> {
    const { subject, html } = businessAccessRejectedEmail(lang, data);
    await this.sendMail(to, subject, html);
  }
}
