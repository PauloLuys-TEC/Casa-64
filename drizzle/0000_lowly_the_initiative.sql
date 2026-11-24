CREATE TABLE `auth_windows` (
	`bucket` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_windows_expiry` ON `auth_windows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_handle_unique` ON `students` (`handle`);--> statement-breakpoint
CREATE TABLE `study_ticks` (
	`student_id` text NOT NULL,
	`event_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`seconds` integer NOT NULL,
	`credited_through` integer NOT NULL,
	PRIMARY KEY(`student_id`, `event_id`),
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_ticks_by_lesson` ON `study_ticks` (`student_id`,`lesson_id`,`seconds`);--> statement-breakpoint
CREATE INDEX `study_ticks_latest` ON `study_ticks` (`student_id`,`credited_through`);