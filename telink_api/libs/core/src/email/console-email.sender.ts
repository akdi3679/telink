import { Injectable, Logger } from '@nestjs/common';
import { EmailSender } from './email-sender';

/**
 * Development email sender: prints to the backend log.
 * Swap for a real SMTP sender in production wiring (Phase 16).
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('EmailSender');

  async send(to: string, subject: string, text: string): Promise<void> {
    this.logger.log(`\n📧 ─────────────────────────────\n` +
      `   TO:      ${to}\n` +
      `   SUBJECT: ${subject}\n` +
      `   ───────\n` +
      `${text.split('\n').map((l) => '   ' + l).join('\n')}\n` +
      `   ─────────────────────────────\n`);
  }
}