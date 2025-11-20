import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterOrdersAddPaymentCols1700000005100 implements MigrationInterface {
  name = 'AlterOrdersAddPaymentCols1700000005100';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE orders
        ADD COLUMN payment_method ENUM('COD','VNPAY') NOT NULL DEFAULT 'COD' AFTER shipping_status,
        ADD COLUMN payment_ref VARCHAR(64) NULL AFTER payment_method,
        ADD COLUMN payment_meta JSON NULL AFTER payment_ref
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE orders
        DROP COLUMN payment_meta,
        DROP COLUMN payment_ref,
        DROP COLUMN payment_method
    `);
  }
}
