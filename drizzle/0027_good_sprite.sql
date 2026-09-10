CREATE TABLE `code_snippets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Untitled snippet' NOT NULL,
	`language` text DEFAULT 'javascript' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`tests` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
