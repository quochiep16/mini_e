import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableColumn } from 'typeorm';

export class InitCategories1700000006000 implements MigrationInterface {
  name = 'InitCategories1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('categories');

    if (!has) {
      await queryRunner.createTable(
        new Table({
          name: 'categories',
          columns: [
            {
              name: 'id',
              type: 'int',
              unsigned: true,
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'name', type: 'varchar', length: '120', isNullable: false },
            { name: 'slug', type: 'varchar', length: '160', isNullable: false },
            { name: 'description', type: 'text', isNullable: true },

            // Ảnh dùng cho danh mục ở trang home / menu category
            { name: 'image_url', type: 'varchar', length: '500', isNullable: true },

            // icon nhỏ, nếu sau này bạn muốn hiển thị menu ngang như Shopee
            { name: 'icon_url', type: 'varchar', length: '500', isNullable: true },

            // banner lớn cho trang danh mục, có thể chưa dùng ngay
            { name: 'banner_url', type: 'varchar', length: '500', isNullable: true },

            { name: 'parent_id', type: 'int', unsigned: true, isNullable: true },
            { name: 'is_active', type: 'tinyint', default: '1' },
            { name: 'sort_order', type: 'int', default: '0' },
            { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'updated_at', type: 'datetime', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
            { name: 'deleted_at', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'categories',
        new TableIndex({ name: 'UQ_categories_slug', columnNames: ['slug'], isUnique: true }),
      );

      await queryRunner.createIndex(
        'categories',
        new TableIndex({ name: 'IDX_categories_parent', columnNames: ['parent_id'] }),
      );

      await queryRunner.createIndex(
        'categories',
        new TableIndex({ name: 'IDX_categories_active', columnNames: ['is_active'] }),
      );

      await queryRunner.createForeignKey(
        'categories',
        new TableForeignKey({
          name: 'FK_categories_parent',
          columnNames: ['parent_id'],
          referencedTableName: 'categories',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    const productsTable = await queryRunner.getTable('products');

    if (productsTable && !productsTable.findColumnByName('category_id')) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({ name: 'category_id', type: 'int', unsigned: true, isNullable: true }),
      );
    }

    const freshProductsTable = await queryRunner.getTable('products');

    const categoryIndexExists = freshProductsTable?.indices?.some((idx) =>
      idx.columnNames.includes('category_id'),
    );

    if (freshProductsTable && !categoryIndexExists) {
      await queryRunner.createIndex(
        'products',
        new TableIndex({ name: 'IDX_products_category', columnNames: ['category_id'] }),
      );
    }

    const fkExists = freshProductsTable?.foreignKeys?.some((fk) => fk.name === 'FK_products_category');

    if (freshProductsTable && !fkExists) {
      await queryRunner.createForeignKey(
        'products',
        new TableForeignKey({
          name: 'FK_products_category',
          columnNames: ['category_id'],
          referencedTableName: 'categories',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const productsTable = await queryRunner.getTable('products');

    const productCategoryFk = productsTable?.foreignKeys?.find((x) => x.name === 'FK_products_category');
    if (productCategoryFk) await queryRunner.dropForeignKey('products', productCategoryFk);

    const productCategoryIndex = productsTable?.indices?.find((x) => x.name === 'IDX_products_category');
    if (productCategoryIndex) await queryRunner.dropIndex('products', productCategoryIndex);

    const categoriesTable = await queryRunner.getTable('categories');
    const parentFk = categoriesTable?.foreignKeys?.find((x) => x.name === 'FK_categories_parent');
    if (parentFk) await queryRunner.dropForeignKey('categories', parentFk);

    if (await queryRunner.hasTable('categories')) {
      await queryRunner.dropTable('categories');
    }
  }
}
