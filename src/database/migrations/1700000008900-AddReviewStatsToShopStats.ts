import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewStatsToShopStats1700000008900
  implements MigrationInterface
{
  name = 'AddReviewStatsToShopStats1700000008900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasRatingAvg = await queryRunner.hasColumn(
      'shop_stats',
      'rating_avg',
    );

    if (!hasRatingAvg) {
      await queryRunner.query(`
        ALTER TABLE shop_stats
        ADD COLUMN rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0.00 AFTER total_orders
      `);
    }

    const hasReviewCount = await queryRunner.hasColumn(
      'shop_stats',
      'review_count',
    );

    if (!hasReviewCount) {
      await queryRunner.query(`
        ALTER TABLE shop_stats
        ADD COLUMN review_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating_avg
      `);
    }

    await queryRunner.query(`
      UPDATE shop_stats ss
      LEFT JOIN (
        SELECT
          p.shop_id AS shop_id,
          COUNT(pr.id) AS review_count,
          COALESCE(ROUND(AVG(pr.rating), 2), 0) AS rating_avg
        FROM products p
        LEFT JOIN product_reviews pr ON pr.product_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.shop_id
      ) x ON x.shop_id = ss.shop_id
      SET
        ss.review_count = COALESCE(x.review_count, 0),
        ss.rating_avg = COALESCE(x.rating_avg, 0),
        ss.updated_at = NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasReviewCount = await queryRunner.hasColumn(
      'shop_stats',
      'review_count',
    );

    if (hasReviewCount) {
      await queryRunner.query(`
        ALTER TABLE shop_stats
        DROP COLUMN review_count
      `);
    }

    const hasRatingAvg = await queryRunner.hasColumn(
      'shop_stats',
      'rating_avg',
    );

    if (hasRatingAvg) {
      await queryRunner.query(`
        ALTER TABLE shop_stats
        DROP COLUMN rating_avg
      `);
    }
  }
}