import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageUrlToCartItems1700000003002 implements MigrationInterface {
  name = 'AddImageUrlToCartItems1700000003002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exist = await queryRunner.query(`
      SELECT COUNT(*) as c
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cart_items'
        AND COLUMN_NAME = 'imageUrl'
    `);

    if (!Number(exist?.[0]?.c ?? 0)) {
      await queryRunner.query(`
        ALTER TABLE cart_items ADD COLUMN imageUrl VARCHAR(500) NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exist = await queryRunner.query(`
      SELECT COUNT(*) as c
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cart_items'
        AND COLUMN_NAME = 'imageUrl'
    `);
    if (Number(exist?.[0]?.c ?? 0)) {
      await queryRunner.query(`ALTER TABLE cart_items DROP COLUMN imageUrl`);
    }
  }
}
