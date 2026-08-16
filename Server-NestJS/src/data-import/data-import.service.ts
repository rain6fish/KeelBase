import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';

export type ImportResult = {
  type: 'user' | 'event' | 'todo';
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
};

/**
 * POV-2 数据导入迁移：管理台批量导入用户/事件（CSV）。
 * 轻量 CSV 解析（无依赖）：首行表头，逗号分隔，支持带引号的字段（含逗号）。
 * 每行独立 try-catch，失败不中断，返回明细供管理台展示。
 */
@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly todosService: TodosService,
  ) {}

  /** 生成临时密码（16 位 hex，含字母+数字，满足密码策略）。导入后用户应走「忘记密码」重置。 */
  private randomPassword(): string {
    return randomBytes(8).toString('hex');
  }

  /** 解析 CSV → 行数组（首行表头）。 */
  parseCsv(csv: string): string[][] {
    if (!csv || !csv.trim()) {
      throw new BadRequestException('CSV 内容为空');
    }
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (inQuotes) {
        if (ch === '"') {
          if (csv[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && csv[i + 1] === '\n') i++;
        row.push(field.trim());
        field = '';
        if (row.some((r) => r !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    if (row.some((r) => r !== '')) rows.push(row);
    return rows;
  }

  /** CSV → 对象数组（首行表头做 key） */
  toObjects(csv: string): Array<Record<string, string>> {
    const rows = this.parseCsv(csv);
    if (rows.length < 2) throw new BadRequestException('CSV 至少需要表头 + 一行数据');
    const headers = rows[0].map((h) => h.toLowerCase());
    return rows.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? '';
      });
      return obj;
    });
  }

  /** 批量导入用户（列：username,email,password,nickname） */
  async importUsers(csv: string): Promise<ImportResult> {
    const objects = this.toObjects(csv);
    const result: ImportResult = { type: 'user', total: objects.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      try {
        await this.usersService.create({
          username: o.username,
          email: o.email,
          password: o.password || this.randomPassword(),
          nickname: o.nickname || o.username,
          firstName: o.firstname,
          lastName: o.lastname,
        } as never);
        result.success++;
      } catch (err) {
        result.failed++;
        // CR-20：不透传内部 Error.message（防泄露校验细节），用通用文案
        this.logger.warn(`[DataImport] user row ${i + 2} failed: ${(err as Error).message}`);
        result.errors.push({ row: i + 2, reason: '导入失败' });
      }
    }
    this.logger.log(`[DataImport] users: ${result.success}/${result.total} ok`);
    return result;
  }

  /** 批量导入事件（列：userId,title,startTime,endTime,location,description） */
  async importEvents(csv: string): Promise<ImportResult> {
    const objects = this.toObjects(csv);
    const result: ImportResult = { type: 'event', total: objects.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      try {
        const userId = Number(o.userid);
        if (!userId) throw new Error('userId 无效');
        await this.eventsService.create(
          {
            title: o.title,
            description: o.description,
            startTime: o.starttime || new Date().toISOString(),
            endTime: o.endtime || new Date().toISOString(),
            location: o.location,
          } as never,
          userId,
        );
        result.success++;
      } catch (err) {
        result.failed++;
        // CR-20：不透传内部 Error.message，用通用文案
        this.logger.warn(`[DataImport] event row ${i + 2} failed: ${(err as Error).message}`);
        result.errors.push({ row: i + 2, reason: '导入失败' });
      }
    }
    this.logger.log(`[DataImport] events: ${result.success}/${result.total} ok`);
    return result;
  }

  /** 批量导入待办（列：userId,title,completed,dueDate） */
  async importTodos(csv: string): Promise<ImportResult> {
    const objects = this.toObjects(csv);
    const result: ImportResult = { type: 'todo', total: objects.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < objects.length; i++) {
      const o = objects[i];
      try {
        const userId = Number(o.userid);
        if (!userId) throw new Error('userId 无效');
        await this.todosService.create(
          {
            title: o.title,
            completed: o.completed === 'true' || o.completed === '1',
            dueDate: o.duedate ? new Date(o.duedate).toISOString() : undefined,
          } as never,
          userId,
        );
        result.success++;
      } catch (err) {
        result.failed++;
        // CR-20：不透传内部 Error.message，用通用文案
        this.logger.warn(`[DataImport] todo row ${i + 2} failed: ${(err as Error).message}`);
        result.errors.push({ row: i + 2, reason: '导入失败' });
      }
    }
    this.logger.log(`[DataImport] todos: ${result.success}/${result.total} ok`);
    return result;
  }
}
