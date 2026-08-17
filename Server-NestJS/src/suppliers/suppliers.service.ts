import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Supplier } from './supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliersRepository: Repository<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto, userId: number): Promise<Supplier> {
    const entity = this.suppliersRepository.create({
      ...dto,
      userId,
    });
    return this.suppliersRepository.save(entity);
  }

  async findAll(userId: number): Promise<Supplier[]> {
    return this.suppliersRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Supplier[]> {
    return this.suppliersRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.suppliersRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<Supplier> {
    const entity = await this.suppliersRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Supplier not found');
    if (ability.cannot('read', subject('Supplier', entity))) {
      throw new ForbiddenException('无权访问此供应商');
    }
    return entity;
  }

  async update(id: number, dto: UpdateSupplierDto, ability: AppAbility): Promise<Supplier> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.suppliersRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.suppliersRepository.softDelete(entity.id);
  }
}
