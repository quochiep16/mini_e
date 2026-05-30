import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterOrderItemsAddShopSnapshot1700000008800
  implements MigrationInterface
{
  name = 'AlterOrderItemsAddShopSnapshot1700000008800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('order_items');

    const hasShopId = table?.findColumnByName('shop_id');
    const hasShopNameSnapshot = table?.findColumnByName('shop_name_snapshot');
    const hasShopIndex = table?.indices.some(
      (index) => index.name === 'IDX_order_items_shop',
    );

    if (!hasShopId) {
      await queryRunner.query(`
        ALTER TABLE order_items
        ADD COLUMN shop_id INT UNSIGNED NULL AFTER product_variant_id
      `);
    }

    if (!hasShopNameSnapshot) {
      await queryRunner.query(`
        ALTER TABLE order_items
        ADD COLUMN shop_name_snapshot VARCHAR(150) NULL AFTER shop_id
      `);
    }

    if (!hasShopIndex) {
      await queryRunner.query(`
        CREATE INDEX IDX_order_items_shop
        ON order_items (shop_id)
      `);
    }

    await queryRunner.query(`
      UPDATE order_items oi
      INNER JOIN products p ON p.id = oi.product_id
      LEFT JOIN shops s ON s.id = p.shop_id
      SET
        oi.shop_id = p.shop_id,
        oi.shop_name_snapshot = COALESCE(oi.shop_name_snapshot, s.name)
      WHERE oi.shop_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('order_items');

    const hasShopIndex = table?.indices.some(
      (index) => index.name === 'IDX_order_items_shop',
    );
    const hasShopNameSnapshot = table?.findColumnByName('shop_name_snapshot');
    const hasShopId = table?.findColumnByName('shop_id');

    if (hasShopIndex) {
      await queryRunner.query(`
        DROP INDEX IDX_order_items_shop ON order_items
      `);
    }

    if (hasShopNameSnapshot) {
      await queryRunner.query(`
        ALTER TABLE order_items
        DROP COLUMN shop_name_snapshot
      `);
    }

    if (hasShopId) {
      await queryRunner.query(`
        ALTER TABLE order_items
        DROP COLUMN shop_id
      `);
    }
  }
}