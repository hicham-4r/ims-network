import { Resend } from "resend";

import { serverEnv } from "@/server/env";

const resend = new Resend(serverEnv.RESEND_API_KEY);

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export class EmailDeliveryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailInput) {
  const { data, error } = await resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    throw new EmailDeliveryError(
      "Transactional email could not be sent.",
    );
  }

  if (!data?.id) {
    throw new EmailDeliveryError(
      "Transactional email provider returned no message ID.",
    );
  }

  return {
    id: data.id,
  };
}
