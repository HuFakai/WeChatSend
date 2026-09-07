import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from './config';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor() {
    const cfg = config();
    this.transporter = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
      pool: true,
      maxConnections: cfg.SMTP_MAX_CONNECTIONS,
      maxMessages: 50,
      connectionTimeout: cfg.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: cfg.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: cfg.SMTP_SOCKET_TIMEOUT_MS,
    });
  }

  async verifyConnection() {
    return this.transporter.verify();
  }

  async send(input: { to: string; subject: string; text: string; messageId?: string }) {
    const cfg = config();
    return this.transporter.sendMail({
      from: cfg.SMTP_FROM || cfg.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      messageId: input.messageId ? `<${input.messageId}@wechatsend.local>` : undefined,
      headers: { 'X-WeChatSend': '1' },
    });
  }
}
