import nodemailer from "nodemailer";
import dns from "node:dns";

// Ensure IPv4 is preferred for Nodemailer (fixes ENETUNREACH on some cloud providers like Render)
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

export const EmailService = {
  /**
   * Sends an OTP code formatted as a professional HTML email.
   */
  async sendOTP(email: string, code: string): Promise<void> {
    const htmlTemplate = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #121212; color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 28px; font-weight: 700; color: #00d2ff;">Peerly</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.5; color: #b3b3b3; margin-bottom: 20px;">
          Your verification code
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00d2ff; background-color: #1e1e1e; padding: 20px 30px; border-radius: 8px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #b3b3b3; text-align: center;">
          Expires in 5 minutes
        </p>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center;">
          <p style="font-size: 12px; color: #666; margin: 0;">
            Ignore if not requested.
          </p>
        </div>
      </div>
    `;

    try {
      const startTime = Date.now();
      const info = await transporter.sendMail({
        from: `"Peerly" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your Peerly Verification Code",
        html: htmlTemplate,
      });
      const latency = Date.now() - startTime;
      console.log(`[Email] recipient=${email} provider=SMTP latency=${latency}ms messageId=${info.messageId}`);
    } catch (error) {
      console.error(`[Email] Failed to send to recipient=${email}`, error);
      throw error;
    }
  },
};
