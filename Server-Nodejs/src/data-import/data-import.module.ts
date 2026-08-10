import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { DataImportService } from './data-import.service';
import { DataImportController } from './data-import.controller';

@Module({
  imports: [UsersModule, EventsModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
