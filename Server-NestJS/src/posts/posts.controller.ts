// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe, DefaultValuePipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

class CommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;
}

@ApiTags('帖子')
@ApiBearerAuth()
@FeatureFlag('posts')
@Controller({ path: 'posts', version: '1' })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: '创建帖子' })
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: JwtPayload) {
    return this.postsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的帖子列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.postsService.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新帖子' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.postsService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除帖子' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.postsService.remove(id, ability);
    return null;
  }

  // ── GROWTH-2 社区动态流：点赞 / 评论 / 关注 ─────────────

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '点赞帖子（幂等）' })
  like(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.postsService.likePost(id, user.sub);
  }

  @Delete(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消点赞' })
  unlike(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.postsService.unlikePost(id, user.sub);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: '评论帖子' })
  comment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.commentPost(id, user.sub, dto.content);
  }

  @Get(':id/comments')
  @ApiOperation({ summary: '帖子评论列表' })
  listComments(
    @Param('id', ParseIntPipe) id: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.postsService.listComments(id, page, limit);
  }

  @Post('users/:followeeId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关注用户' })
  follow(
    @Param('followeeId', ParseIntPipe) followeeId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.followUser(followeeId, user.sub);
  }

  @Delete('users/:followeeId/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消关注' })
  unfollow(
    @Param('followeeId', ParseIntPipe) followeeId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.postsService.unfollowUser(followeeId, user.sub);
  }
}
