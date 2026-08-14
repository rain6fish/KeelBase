import { SetMetadata } from '@nestjs/common';
import { FEATURE_KEY_METADATA, FeatureKey } from './feature-flags.constants';

/** 声明控制器/端点归属的某个特性，配合 FeatureDisabledGuard 在特性关闭时 404。 */
export const FeatureFlag = (key: FeatureKey) => SetMetadata(FEATURE_KEY_METADATA, key);
