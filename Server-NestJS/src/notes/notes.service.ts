// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Note } from './note.entity';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  async create(dto: CreateNoteDto, userId: number): Promise<Note> {
    const entity = this.notesRepository.create({
      ...dto,
      userId,
    });
    return this.notesRepository.save(entity);
  }

  async findAll(userId: number): Promise<Note[]> {
    return this.notesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Note[]> {
    return this.notesRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.notesRepository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<Note> {
    const entity = await this.notesRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Note not found');
    if (ability.cannot('read', subject('Note', entity))) {
      throw new ForbiddenException('无权访问此笔记');
    }
    return entity;
  }

  async update(id: number, dto: UpdateNoteDto, ability: AppAbility): Promise<Note> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.notesRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.notesRepository.softDelete(entity.id);
  }
}
