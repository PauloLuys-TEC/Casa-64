import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  platformId: text("platform_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("sessions_expiry").on(table.expiresAt)]);

export const authWindows = sqliteTable("auth_windows", {
  bucket: text("bucket").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("auth_windows_expiry").on(table.expiresAt)]);

// Append-only receipts make retries idempotent and coordinate overlapping study tabs.
export const studyTicks = sqliteTable("study_ticks", {
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  seconds: integer("seconds").notNull(),
  creditedThrough: integer("credited_through").notNull(),
}, (table) => [
  primaryKey({ columns: [table.studentId, table.eventId] }),
  index("study_ticks_by_lesson").on(table.studentId, table.lessonId, table.seconds),
  index("study_ticks_latest").on(table.studentId, table.creditedThrough),
]);
