import { Controller, Post, UploadedFile, UseInterceptors, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DataImportService } from './data-import.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';

/** POV-2 数据导入迁移（管理员）：CSV 批量导入用户/事件。 */
@ApiTags('数据导入')
@ApiBearerAuth()
@Controller({ path: 'admin/import', version: '1' })
export class DataImportController {
  constructor(private readonly dataImport: DataImportService) {}

  @Post('users')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'POV-2 批量导入用户（CSV：username,email,password,nickname）' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async importUsers(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传 CSV 文件');
    return this.dataImport.importUsers(file.buffer.toString('utf8'));
  }

  @Post('events')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'POV-2 批量导入事件（CSV：userId,title,startTime,endTime,location,description）' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async importEvents(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传 CSV 文件');
    return this.dataImport.importEvents(file.buffer.toString('utf8'));
  }

  @Post('todos')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'POV-2 批量导入待办（CSV：userId,title,completed,dueDate）' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async importTodos(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传 CSV 文件');
    return this.dataImport.importTodos(file.buffer.toString('utf8'));
  }
}
