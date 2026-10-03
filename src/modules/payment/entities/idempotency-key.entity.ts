import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_keys')
@Index(['key'], { unique: true })
@Index(['expiresAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 128, unique: true })
  key: string;

  @Column({ name: 'target_resource', length: 64 })
  targetResource: string;

  @Column({ name: 'request_hash', length: 64 })
  requestHash: string;

  @Column({ name: 'response_code', type: 'int', nullable: true })
  responseCode?: number;

  @Column({ name: 'response_body', type: 'simple-json', nullable: true })
  responseBody?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'expires_at' })
  expiresAt: Date;
}
