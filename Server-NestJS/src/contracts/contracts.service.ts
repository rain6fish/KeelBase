import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Contract } from './contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractsRepository: Repository<Contract>,
  ) {}

  async create(dto: CreateContractDto, userId: number): Promise<Contract> {
    const entity = this.contractsRepository.create({
      ...dto,
      userId,
    });
    return this.contractsRepository.save(entity);
  }

  async findAll(userId: number): Promise<Contract[]> {
    return this.contractsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Contract[]> {
    return this.contractsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.contractsRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<Contract> {
    const entity = await this.contractsRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Contract not found');
    if (ability.cannot('read', subject('Contract', entity))) {
      throw new ForbiddenException('无权访问此合同');
    }
    return entity;
  }

  async update(id: number, dto: UpdateContractDto, ability: AppAbility): Promise<Contract> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.contractsRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.contractsRepository.softDelete(entity.id);
  }
}
