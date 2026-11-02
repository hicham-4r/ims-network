import { sendEmail } from "./resend";

type SendPasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailInput) {
  return sendEmail({
    to,
    subject: "Reset your IMS Network password",
    text: [
      "A password reset was requested for your IMS Network account.",
      "",
      resetUrl,
      "",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>A password reset was requested for your IMS Network account.</p>
      <p>
        <a href="${resetUrl}">
          Reset password
        </a>
      </p>
      <p>If you did not request this reset, you can ignore this email.</p>
    `,
  });
}
