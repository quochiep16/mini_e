import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitProductReviews1700000007000 implements MigrationInterface {
  name = 'InitProductReviews1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'product_reviews',
        columns: [
          { name: 'id', type: 'char', length: '36', isPrimary: true },
          { name: 'order_id', type: 'char', length: '36', isNullable: false },
          { name: 'user_id', type: 'int', isNullable: false },
          { name: 'product_id', type: 'int', unsigned: true, isNullable: false },
          { name: 'rating', type: 'tinyint', unsigned: true, isNullable: false },
          { name: 'comment', type: 'text', isNullable: true },
          { name: 'images', type: 'json', isNullable: true },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'product_reviews',
      new TableIndex({ name: 'UQ_reviews_order', columnNames: ['order_id'], isUnique: true }),
    );
    await queryRunner.createIndex(
      'product_reviews',
      new TableIndex({ name: 'IDX_reviews_product', columnNames: ['product_id'] }),
    );
    await queryRunner.createIndex(
      'product_reviews',
      new TableIndex({ name: 'IDX_reviews_user', columnNames: ['user_id'] }),
    );

    await queryRunner.createForeignKey(
      'product_reviews',
      new TableForeignKey({
        name: 'FK_reviews_order',
        columnNames: ['order_id'],
        referencedTableName: 'orders',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'product_reviews',
      new TableForeignKey({
        name: 'FK_reviews_product',
        columnNames: ['product_id'],
        referencedTableName: 'products',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('product_reviews');
    if (table) {
      const fk1 = table.foreignKeys.find((fk) => fk.name === 'FK_reviews_order');
      if (fk1) await queryRunner.dropForeignKey('product_reviews', fk1);

      const fk2 = table.foreignKeys.find((fk) => fk.name === 'FK_reviews_product');
      if (fk2) await queryRunner.dropForeignKey('product_reviews', fk2);
    }
    await queryRunner.dropTable('product_reviews');
  }
}
