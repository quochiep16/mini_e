import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixProductReviews1700000007100
  implements MigrationInterface
{
  name = 'FixProductReviews1700000007100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * 1. Tìm FK đang dùng column order_id trong product_reviews
     * MySQL không cho drop index nếu index đó đang được FK dùng.
     */
    const orderFks: Array<{ CONSTRAINT_NAME: string }> =
      await queryRunner.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'product_reviews'
          AND COLUMN_NAME = 'order_id'
          AND REFERENCED_TABLE_NAME = 'orders'
      `);

    for (const fk of orderFks) {
      await queryRunner.query(`
        ALTER TABLE product_reviews
        DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\`
      `);
    }

    /**
     * 2. Drop unique cũ: 1 order chỉ có 1 review
     */
    await queryRunner.query(`
      ALTER TABLE product_reviews
      DROP INDEX UQ_reviews_order
    `);

    /**
     * 3. Tạo unique mới: 1 order + 1 product chỉ có 1 review
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_reviews_order_product
      ON product_reviews (order_id, product_id)
    `);

    /**
     * 4. Tạo lại FK order_id -> orders(id)
     */
    await queryRunner.query(`
      ALTER TABLE product_reviews
      ADD CONSTRAINT FK_reviews_order
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /**
     * 1. Drop FK order_id trước
     */
    const orderFks: Array<{ CONSTRAINT_NAME: string }> =
      await queryRunner.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'product_reviews'
          AND COLUMN_NAME = 'order_id'
          AND REFERENCED_TABLE_NAME = 'orders'
      `);

    for (const fk of orderFks) {
      await queryRunner.query(`
        ALTER TABLE product_reviews
        DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\`
      `);
    }

    /**
     * 2. Drop unique mới
     */
    await queryRunner.query(`
      DROP INDEX UQ_reviews_order_product ON product_reviews
    `);

    /**
     * 3. Tạo lại unique cũ
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_reviews_order
      ON product_reviews (order_id)
    `);

    /**
     * 4. Tạo lại FK order_id -> orders(id)
     */
    await queryRunner.query(`
      ALTER TABLE product_reviews
      ADD CONSTRAINT FK_reviews_order
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
    `);
  }
}