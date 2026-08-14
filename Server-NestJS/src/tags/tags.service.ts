import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Tag } from './tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  async create(dto: CreateTagDto, userId: number): Promise<Tag> {
    const entity = this.tagsRepository.create({
      ...dto,
      userId,
    });
    return this.tagsRepository.save(entity);
  }

  async findAll(userId: number): Promise<Tag[]> {
    return this.tagsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Tag[]> {
    return this.tagsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.tagsRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<Tag> {
    const entity = await this.tagsRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Tag not found');
    if (ability.cannot('read', subject('Tag', entity))) {
      throw new ForbiddenException('无权访问此标签');
    }
    return entity;
  }

  async update(id: number, dto: UpdateTagDto, ability: AppAbility): Promise<Tag> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.tagsRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.tagsRepository.softDelete(entity.id);
  }
}
