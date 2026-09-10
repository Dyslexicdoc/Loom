CREATE TABLE `diagrams` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Untitled diagram' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`generated_by` text DEFAULT 'manual' NOT NULL,
	`model` text,
	`error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
