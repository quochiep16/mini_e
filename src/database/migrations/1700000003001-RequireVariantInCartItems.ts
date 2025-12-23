// src/database/migrations/1700000003001-RequireVariantInCartItems.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequireVariantInCartItems1700000003001
  implements MigrationInterface
{
  name = 'RequireVariantInCartItems1700000003001';

  public async up(q: QueryRunner): Promise<void> {
    // 1) Xoá dữ liệu cũ (nếu trước đây có item không có variant)
    await q.query(`
      DELETE FROM cart_items
      WHERE variantId IS NULL
    `);

    // 2) Drop unique cũ (nếu tồn tại)
    const oldIdx = await q.query(`
      SHOW INDEX FROM cart_items
      WHERE Key_name = 'UQ_cartitem_unique_line'
    `);
    if (Array.isArray(oldIdx) && oldIdx.length > 0) {
      await q.query(`
        ALTER TABLE cart_items
        DROP INDEX UQ_cartitem_unique_line
      `);
    }

    // 3) Ép variantId NOT NULL (nếu hiện tại còn nullable)
    const col = await q.query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cart_items'
        AND COLUMN_NAME = 'variantId'
      LIMIT 1
    `);

    if (Array.isArray(col) && col[0]?.IS_NULLABLE === 'YES') {
      await q.query(`
        ALTER TABLE cart_items
        MODIFY variantId INT NOT NULL
      `);
    }

    // 4) Add unique mới theo (cartId, variantId) (nếu chưa có)
    const newIdx = await q.query(`
      SHOW INDEX FROM cart_items
      WHERE Key_name = 'UQ_cartitem_unique_variant'
    `);
    if (!Array.isArray(newIdx) || newIdx.length === 0) {
      await q.query(`
        ALTER TABLE cart_items
        ADD UNIQUE KEY UQ_cartitem_unique_variant (cartId, variantId)
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // rollback unique mới
    const newIdx = await q.query(`
      SHOW INDEX FROM cart_items
      WHERE Key_name = 'UQ_cartitem_unique_variant'
    `);
    if (Array.isArray(newIdx) && newIdx.length > 0) {
      await q.query(`
        ALTER TABLE cart_items
        DROP INDEX UQ_cartitem_unique_variant
      `);
    }

    // cho phép nullable lại (để quay về schema cũ)
    const col = await q.query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cart_items'
        AND COLUMN_NAME = 'variantId'
      LIMIT 1
    `);

    if (Array.isArray(col) && col[0]?.IS_NULLABLE === 'NO') {
      await q.query(`
        ALTER TABLE cart_items
        MODIFY variantId INT NULL
      `);
    }

    // add lại unique cũ (nếu chưa có)
    const oldIdx = await q.query(`
      SHOW INDEX FROM cart_items
      WHERE Key_name = 'UQ_cartitem_unique_line'
    `);
    if (!Array.isArray(oldIdx) || oldIdx.length === 0) {
      await q.query(`
        ALTER TABLE cart_items
        ADD UNIQUE KEY UQ_cartitem_unique_line (cartId, productId, variantId)
      `);
    }
  }
}
