import { sendEmail } from "./resend";

type SendVerificationEmailInput = {
  to: string;
  verificationUrl: string;
};

export async function sendVerificationEmail({
  to,
  verificationUrl,
}: SendVerificationEmailInput) {
  return sendEmail({
    to,
    subject: "Verify your IMS Network email",
    text: [
      "Verify your email address to continue using IMS Network.",
      "",
      verificationUrl,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>Verify your email address to continue using IMS Network.</p>
      <p>
        <a href="${verificationUrl}">
          Verify email address
        </a>
      </p>
      <p>If you did not create this account, you can ignore this email.</p>
    `,
  });
}
