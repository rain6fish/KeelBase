import { Injectable } from '@nestjs/common';
import { APP_VERSION } from './app-version.config';

@Injectable()
export class AppVersionService {
  getVersionInfo() {
    return {
      latestVersion: APP_VERSION.latestVersion,
      minRequiredVersion: APP_VERSION.minRequiredVersion,
      updateUrl: APP_VERSION.updateUrl,
      changelog: APP_VERSION.changelog,
    };
  }
}
