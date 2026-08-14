import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';
import { UserFollow } from './user-follow.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly likesRepository: Repository<PostLike>,
    @InjectRepository(PostComment)
    private readonly commentsRepository: Repository<PostComment>,
    @InjectRepository(UserFollow)
    private readonly followsRepository: Repository<UserFollow>,
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

  // ── GROWTH-2 社区动态流：点赞 / 评论 / 关注 ─────────────

  /** 点赞（幂等：已赞则 no-op），返回最新点赞数 */
  async likePost(postId: number, userId: number): Promise<{ liked: boolean; likes: number }> {
    await this._assertPostExists(postId);
    const existing = await this.likesRepository.findOne({ where: { postId, userId } });
    if (!existing) {
      await this.likesRepository.save(this.likesRepository.create({ postId, userId }));
    }
    return { liked: true, likes: await this._likeCount(postId) };
  }

  /** 取消点赞（幂等），返回最新点赞数 */
  async unlikePost(postId: number, userId: number): Promise<{ liked: boolean; likes: number }> {
    await this._assertPostExists(postId);
    await this.likesRepository.delete({ postId, userId });
    return { liked: false, likes: await this._likeCount(postId) };
  }

  /** 评论帖子 */
  async commentPost(postId: number, userId: number, content: string): Promise<PostComment> {
    await this._assertPostExists(postId);
    return this.commentsRepository.save(
      this.commentsRepository.create({ postId, userId, content }),
    );
  }

  /** 帖子评论列表（分页） */
  async listComments(postId: number, page = 1, limit = 20): Promise<{ total: number; items: PostComment[] }> {
    const [items, total] = await this.commentsRepository.findAndCount({
      where: { postId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { total, items };
  }

  /** 关注用户（幂等：已关注 no-op） */
  async followUser(followeeId: number, followerId: number): Promise<{ following: boolean }> {
    if (followeeId === followerId) throw new ForbiddenException('不能关注自己');
    const existing = await this.followsRepository.findOne({
      where: { followerId, followeeId },
    });
    if (!existing) {
      await this.followsRepository.save(
        this.followsRepository.create({ followerId, followeeId }),
      );
    }
    return { following: true };
  }

  /** 取消关注 */
  async unfollowUser(followeeId: number, followerId: number): Promise<{ following: boolean }> {
    await this.followsRepository.delete({ followerId, followeeId });
    return { following: false };
  }

  private async _assertPostExists(postId: number): Promise<void> {
    const exists = await this.postsRepository.findOne({ where: { id: postId } });
    if (!exists) throw new NotFoundException('Post not found');
  }

  private async _likeCount(postId: number): Promise<number> {
    return this.likesRepository.count({ where: { postId } });
  }
}
