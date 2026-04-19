import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAddresses1700000004000 implements MigrationInterface {
  name = 'InitAddresses1700000004000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE user_addresses (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId INT UNSIGNED NOT NULL,
        fullName VARCHAR(120) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        formattedAddress VARCHAR(300) NOT NULL,
        placeId VARCHAR(128) NULL,
        lat DECIMAL(10,7) NULL,
        lng DECIMAL(10,7) NULL,
        isDefault TINYINT(1) NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY IDX_user_addresses_user (userId),
        CONSTRAINT FK_user_addresses_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_addresses`);
  }
}