import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUsersFull1700000000000 implements MigrationInterface {
  name = 'InitUsersFull1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(120) NOT NULL,
        \`email\` VARCHAR(320) NOT NULL,
        \`phone\` VARCHAR(20) NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`avatarUrl\` TEXT NULL,
        \`birthday\` DATE NULL,
        \`gender\` ENUM('MALE','FEMALE','OTHER') NULL,

        \`otp\` VARCHAR(255) NULL,
        \`time_otp\` DATETIME(6) NULL,

        \`isVerified\` TINYINT(1) NOT NULL DEFAULT 0,
        \`role\` ENUM('USER','SELLER','ADMIN') NOT NULL DEFAULT 'USER',
        \`lastLoginAt\` DATETIME(6) NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deletedAt\` DATETIME(6) NULL,
        CONSTRAINT \`PK_users_id\` PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB AUTO_INCREMENT=10000000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX \`users_email_uq\` ON \`users\` (\`email\`);`);
    await queryRunner.query(`CREATE INDEX \`users_phone_idx\` ON \`users\` (\`phone\`);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query('DROP INDEX `users_phone_idx` ON `users`;');
    await queryRunner.query('DROP INDEX `users_email_uq` ON `users`;');
    await queryRunner.query('DROP TABLE `users`;');
  }
}
