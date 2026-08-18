-- 示例「已有系统」：一个老版客户管理系统的建表 SQL（Existing System AIization 演示素材）
-- 模拟：企业有一张运行多年的 legacy_customers 表，想接入 KeelBase 让它变 AI 化
CREATE TABLE legacy_customers (
  id BIGINT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  company VARCHAR(120),
  contact_phone VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'active', 'churn_risk', 'inactive')),
  risk_level VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  annual_value DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 第二张表（--table 指定或默认第一张）
CREATE TABLE legacy_orders (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  order_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (order_status IN ('pending', 'paid', 'overdue', 'cancelled')),
  order_date DATE,
  due_date DATE
);
