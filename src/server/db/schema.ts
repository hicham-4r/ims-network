import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export * from "./auth-schema";

export const ACCOUNT_STATUS_VALUES = [
  "UNVERIFIED",
  "PENDING_APPROVAL",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
] as const;

export const ACCOUNT_ROLE_VALUES = [
  "MEMBER",
  "ADMIN",
] as const;

export const accountStatus = pgEnum(
  "account_status",
  ACCOUNT_STATUS_VALUES,
);

export const accountRole = pgEnum(
  "account_role",
  ACCOUNT_ROLE_VALUES,
);

export type AccountStatus =
  (typeof ACCOUNT_STATUS_VALUES)[number];

export type AccountRole =
  (typeof ACCOUNT_ROLE_VALUES)[number];

export const applicationUserState = pgTable(
  "application_user_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    status: accountStatus("status")
      .default("UNVERIFIED")
      .notNull(),

    role: accountRole("role")
      .default("MEMBER")
      .notNull(),

    approvedAt: timestamp("approved_at", {
      withTimezone: true,
    }),

    approvedBy: text("approved_by").references(
      () => user.id,
      {
        onDelete: "set null",
      },
    ),

    rejectedAt: timestamp("rejected_at", {
      withTimezone: true,
    }),

    rejectionReason: text("rejection_reason"),

    suspendedAt: timestamp("suspended_at", {
      withTimezone: true,
    }),

    suspensionReason: text("suspension_reason"),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("application_user_state_status_idx").on(
      table.status,
    ),
    index("application_user_state_role_idx").on(
      table.role,
    ),
  ],
);

export type AuditMetadata = Record<
  string,
  string | number | boolean | null
>;

export const auditLog = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),

    actorUserId: text("actor_user_id").references(
      () => user.id,
      {
        onDelete: "set null",
      },
    ),

    action: text("action").notNull(),

    targetType: text("target_type").notNull(),

    targetId: text("target_id").notNull(),

    metadata: jsonb("metadata").$type<AuditMetadata>(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_actor_user_id_idx").on(
      table.actorUserId,
    ),
    index("audit_logs_target_idx").on(
      table.targetType,
      table.targetId,
    ),
    index("audit_logs_created_at_idx").on(
      table.createdAt,
    ),
  ],
);


export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    displayName: text("display_name")
      .notNull(),

    displayNameSearch: text(
      "display_name_search",
    ).notNull(),

    program: text("program"),

    programSearch: text(
      "program_search",
    ),

    department: text("department"),

    departmentSearch: text(
      "department_search",
    ),

    graduationYear: integer(
      "graduation_year",
    ),

    bio: text("bio"),

    avatarUrl: text("avatar_url"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("profiles_display_name_search_idx").on(
      table.displayNameSearch,
    ),

    index("profiles_program_search_idx").on(
      table.programSearch,
    ),

    index("profiles_department_search_idx").on(
      table.departmentSearch,
    ),

    index("profiles_graduation_year_idx").on(
      table.graduationYear,
    ),
  ],
);
