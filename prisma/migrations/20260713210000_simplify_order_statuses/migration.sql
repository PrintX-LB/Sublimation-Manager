-- Map legacy workflow statuses to the four operational statuses plus Cancelled.
UPDATE "Order" SET status = 'Draft' WHERE status IN ('Awaiting customer files', 'Design preparation', 'Awaiting customer approval');
UPDATE "Order" SET status = 'Ready to print' WHERE status = 'Approved';
UPDATE "Order" SET status = 'Completed' WHERE status IN ('Ready for collection', 'Shipped', 'Delivered');
