// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostComment } from './post-comment.entity';
import { UserFollow } from './user-follow.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { paginated } from '../common/dto/paginated';

/** 列表 `?q=` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */
const POST_SEARCH_COLUMNS = ['title', 'content'];

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

  async findAll(userId: number, q?: string): Promise<Array<Post & { likes: number; comments: number }>> {
    const keyword = q?.trim();
    // Every arm carries the ownership condition, so a hit on any column still stays the caller's
    // own rows.
    // 每条分支各自带归属条件，故任何一列命中都仍限在调用方自己的行内。
    const where = keyword
      ? POST_SEARCH_COLUMNS.map((column) => ({ userId, [column]: Like(`%${keyword}%`) }))
      : { userId };
    const posts = await this.postsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    // GROWTH-2：聚合点赞/评论数（前端列表展示）
    const likeCounts = await this._likeCounts(posts.map((p) => p.id));
    const commentCounts = await this._commentCounts(posts.map((p) => p.id));
    return posts.map((p) => ({
      ...p,
      likes: likeCounts.get(p.id) ?? 0,
      comments: commentCounts.get(p.id) ?? 0,
    }));
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
    const { version, ...fields } = dto;
    // The conditional update is the **only** arbiter: the row is written only while it is still at
    // the version the caller read, so two writers cannot both succeed.
    //
    // Note what is deliberately *not* used: save(). A version column bumps on write but does not
    // guard the write — checked against the SQL the driver actually emits, the UPDATE carries no
    // version predicate — so a stale save silently overwrites. Zero rows affected is the conflict.
    //
    // 条件更新是**唯一**仲裁点：只有当行仍停在调用方读到的那个版本时才写入，故两个写入者不可能同时成功。
    //
    // 这里刻意**不用** save()：版本列会在写入时自增，却不为写入设防 —— 按驱动实发的 SQL 核过，
    // 那条 UPDATE 里没有版本判据 —— 于是一次陈旧的保存就是无声覆盖。「影响 0 行」即冲突。
    const result = await this.postsRepository.update(
      { id: entity.id, version },
      { ...fields, version: () => 'version + 1' },
    );
    if (!result.affected) {
      throw new ConflictException('该记录已被他人修改，请刷新后重试');
    }
    return this.findOne(id, ability);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.postsRepository.softDelete(entity.id);
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<Post[]> {
    return this.postsRepository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.postsRepository.softDelete(id);
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
    return paginated(items, total, page, limit);
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

  private async _likeCounts(postIds: number[]): Promise<Map<number, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await this.likesRepository
      .createQueryBuilder('l')
      .select('l.postId', 'postId')
      .addSelect('COUNT(*)', 'cnt')
      .where('l.postId IN (:...ids)', { ids: postIds })
      .groupBy('l.postId')
      .getRawMany<{ postId: string; cnt: string }>();
    return new Map(rows.map((r) => [Number(r.postId), Number(r.cnt)]));
  }

  private async _commentCounts(postIds: number[]): Promise<Map<number, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await this.commentsRepository
      .createQueryBuilder('c')
      .select('c.postId', 'postId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.postId IN (:...ids)', { ids: postIds })
      .groupBy('c.postId')
      .getRawMany<{ postId: string; cnt: string }>();
    return new Map(rows.map((r) => [Number(r.postId), Number(r.cnt)]));
  }
}
