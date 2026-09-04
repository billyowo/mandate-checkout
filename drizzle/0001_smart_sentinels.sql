CREATE TABLE `agentQuotes` (
	`id` varchar(64) NOT NULL,
	`mandateId` varchar(64) NOT NULL,
	`merchantId` varchar(64) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`amountPaise` int NOT NULL,
	`status` enum('allowed','refused') NOT NULL,
	`policySnapshot` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentQuotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEntries` (
	`id` varchar(64) NOT NULL,
	`mandateId` varchar(64),
	`orderId` varchar(64),
	`action` varchar(64) NOT NULL,
	`selectedSku` varchar(64),
	`amountPaise` int,
	`rationale` text NOT NULL,
	`policyResult` enum('allowed','refused','observed') NOT NULL,
	`outcome` varchar(64) NOT NULL,
	`details` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `buyerMandates` (
	`id` varchar(64) NOT NULL,
	`label` varchar(120) NOT NULL,
	`merchantAllowlist` text NOT NULL,
	`spendCapPaise` int NOT NULL,
	`spentPaise` int NOT NULL DEFAULT 0,
	`reservedPaise` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`status` enum('active','expired','suspended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buyerMandates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catalogProducts` (
	`id` varchar(64) NOT NULL,
	`merchantId` varchar(64) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`pricePaise` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'INR',
	`stock` int NOT NULL,
	`gstBps` int NOT NULL,
	`returnPolicy` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalogProducts_id` PRIMARY KEY(`id`),
	CONSTRAINT `catalogProducts_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `checkoutOrders` (
	`id` varchar(64) NOT NULL,
	`mandateId` varchar(64) NOT NULL,
	`quoteId` varchar(64) NOT NULL,
	`merchantId` varchar(64) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`amountPaise` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'INR',
	`provider` enum('demo','razorpay') NOT NULL DEFAULT 'demo',
	`providerOrderId` varchar(128) NOT NULL,
	`providerPaymentId` varchar(128),
	`status` enum('created','payment_pending','paid','failed','refused') NOT NULL DEFAULT 'created',
	`policySnapshot` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checkoutOrders_id` PRIMARY KEY(`id`)
);
