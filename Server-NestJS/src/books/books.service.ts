// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Book } from './book.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Book)
    private readonly booksRepository: Repository<Book>,
  ) {}

  async create(dto: CreateBookDto, userId: number): Promise<Book> {
    const entity = this.booksRepository.create({
      ...dto,
      userId,
    });
    return this.booksRepository.save(entity);
  }

  async findAll(userId: number): Promise<Book[]> {
    return this.booksRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, ability: AppAbility): Promise<Book> {
    const entity = await this.booksRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Book not found');
    if (ability.cannot('read', subject('Book', entity))) {
      throw new ForbiddenException('无权访问此图书');
    }
    return entity;
  }

  async update(id: number, dto: UpdateBookDto, ability: AppAbility): Promise<Book> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.booksRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.booksRepository.softDelete(entity.id);
  }
}
