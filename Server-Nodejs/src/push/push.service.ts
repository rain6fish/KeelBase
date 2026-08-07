/**
 * 推送通知抽象接口 + DI token。
 * 实现：NoopPushService（未配置降级）/ JPushService（极光，国内）。
 * FCM/APNs 实现待凭据到位后补充（接口语义三家通用）。
 */
export const PUSH_SERVICE = 'PUSH_SERVICE';

export interface PushPayload {
  /** 标题 */
  title: string;
  /** 正文 */
  body: string;
  /** 自定义数据（跳转/业务字段） */
  data?: Record<string, string>;
}

export interface PushService {
  /**
   * 推送单个设备（deviceToken 为厂商注册 ID，如极光 registration_id）。
   */
  sendToDevice(deviceToken: string, payload: PushPayload): Promise<void>;

  /**
   * 推送一个主题/标签下的所有设备。
   */
  sendToTopic(topic: string, payload: PushPayload): Promise<void>;
}
