import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Post } from './post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
  ) {}

  async create(dto: CreatePostDto, userId: number): Promise<Post> {
    const entity = this.postsRepository.create({
      ...dto,
      userId,
    });
    return this.postsRepository.save(entity);
  }

  async findAll(userId: number): Promise<Post[]> {
    return this.postsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, ability: AppAbility): Promise<Post> {
    const entity = await this.postsRepository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Post not found');
    if (ability.cannot('read', subject('Post', entity))) {
      throw new ForbiddenException('无权访问此帖子');
    }
    return entity;
  }

  async update(id: number, dto: UpdatePostDto, ability: AppAbility): Promise<Post> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.postsRepository.save(entity);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.postsRepository.softDelete(entity.id);
  }
}
