CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Untitled deck' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'neon' NOT NULL,
	`generated_by` text DEFAULT 'manual' NOT NULL,
	`model` text,
	`error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
