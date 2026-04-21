import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddSystemFieldsToUsers1700000000200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'is_system',
        type: 'tinyint',
        width: 1,
        isNullable: false,
        default: 0,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'system_code',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'users_system_code_uq',
        columnNames: ['system_code'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'users_system_code_uq');
    await queryRunner.dropColumn('users', 'system_code');
    await queryRunner.dropColumn('users', 'is_system');
  }
}