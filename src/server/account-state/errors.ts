import type {
  AccountRole,
  AccountStatus,
} from "@/server/db/schema";

export type AccountAccessErrorCode =
  | "ACCOUNT_NOT_ACTIVE"
  | "ADMIN_REQUIRED";

export class AccountAccessError extends Error {
  readonly code: AccountAccessErrorCode;
  readonly accountStatus: AccountStatus;
  readonly accountRole: AccountRole;

  constructor({
    code,
    message,
    accountStatus,
    accountRole,
  }: {
    code: AccountAccessErrorCode;
    message: string;
    accountStatus: AccountStatus;
    accountRole: AccountRole;
  }) {
    super(message);

    this.name = "AccountAccessError";
    this.code = code;
    this.accountStatus = accountStatus;
    this.accountRole = accountRole;
  }
}
