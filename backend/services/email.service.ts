export const EmailService = {
  /**
   * Sends an OTP code formatted as a professional HTML email via Brevo REST API.
   */
  async sendOTPEmail(email: string, otp: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error("BREVO_API_KEY environment variable is missing.");
    }

    const htmlContent = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #121212; color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 28px; font-weight: 700; color: #00d2ff;">Peerly</h2>
        </div>
        <p style="font-size: 16px; line-height: 1.5; color: #b3b3b3; margin-bottom: 20px;">
          Your verification code
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00d2ff; background-color: #1e1e1e; padding: 20px 30px; border-radius: 8px; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="font-size: 14px; color: #b3b3b3; text-align: center;">
          Expires in 10 minutes
        </p>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center;">
          <p style="font-size: 12px; color: #666; margin: 0;">
            Ignore if not requested.
          </p>
        </div>
      </div>
    `;

    const textContent = `Peerly\n\nYour verification code is: ${otp}\n\nExpires in 10 minutes.\nIgnore if not requested.`;

    const payload = {
      sender: { name: "Peerly", email: "noreply@peerly.app" },
      to: [{ email: email }],
      subject: "Your Peerly Verification Code",
      htmlContent: htmlContent,
      textContent: textContent
    };

    const startTime = Date.now();
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseBody = await response.text();
      const latency = Date.now() - startTime;

      if (!response.ok) {
        console.error(`[Email Error] Failed to send OTP email to ${email}`);
        console.error(`[Email Error] HTTP Status: ${response.status}`);
        console.error(`[Email Error] Brevo Response: ${responseBody}`);
        throw new Error("Failed to send OTP email");
      }

      let messageId = "unknown";
      try {
        const parsed = JSON.parse(responseBody);
        messageId = parsed.messageId || messageId;
      } catch (e) {
        // ignore parse error if response is not JSON
      }

      console.log(`[Email] Recipient: ${email}`);
      console.log(`[Email] Status: success`);
      console.log(`[Email] Brevo Message ID: ${messageId}`);
      console.log(`[Email] Latency: ${latency}ms`);
      
    } catch (error) {
      if (error instanceof Error && error.message === "Failed to send OTP email") {
        throw error;
      }
      console.error(`[Email Error] Exception while sending to ${email}:`, error);
      throw new Error("Failed to send OTP email");
    }
  }
};
