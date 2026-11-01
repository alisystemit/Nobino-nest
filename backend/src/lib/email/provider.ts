import nodemailer from "nodemailer";
import { getSetting } from "@/lib/settings";

export interface EmailSender {
  sendEmail(to: string, subject: string, html: string): Promise<void>;
  isConfigured(): Promise<boolean>;
}

class SmtpEmailSender implements EmailSender {
  async isConfigured() {
    const host = await getSetting("email.smtp_host");
    return Boolean(host);
  }
  async sendEmail(to: string, subject: string, html: string) {
    const host = await getSetting("email.smtp_host") ?? "";
    const port = Number(await getSetting("email.smtp_port") ?? 587);
    const user = await getSetting("email.smtp_user") ?? "";
    const pass = await getSetting("email.smtp_pass") ?? "";
    const from = await getSetting("email.from") ?? "noreply@nobino.ir";

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });

    await transporter.sendMail({ from, to, subject, html });
  }
}

class MockEmailSender implements EmailSender {
  async isConfigured() {
    return true;
  }
  async sendEmail(to: string, subject: string, html: string) {
    // در حالت mock متن ایمیل فقط لاگ می‌شود.
    void html;
    console.log(`[EMAIL:MOCK] به ${to} — موضوع: ${subject}`);
  }
}

export async function getEmailSender(): Promise<EmailSender> {
  const sender = new SmtpEmailSender();
  if (await sender.isConfigured()) return sender;
  return new MockEmailSender();
}
