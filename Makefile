# ShiYu-AppBase 统一命令入口（傻瓜化：不用记一堆命令）
#
# 最常用：
#   make experience     一键体验（起后端+管理台，自动开浏览器）
#   make dev            本地开发起后端（热重载）
#   make test           跑全部测试（后端+前端）
#   make build          生产构建
#
# 完整列表见下方 help target。

.PHONY: help experience dev dev-admin admin web test test-backend test-frontend build build-prod lint docker-up docker-down migrate migrate-generate backup db-redis clean

help: ## 显示所有命令
	@echo "ShiYu-AppBase 常用命令："
	@echo ""
	@echo "  体验/运行"
	@echo "    make experience      一键体验（起后端+管理台，自动开浏览器）"
	@echo "    make dev             本地开发：起后端（热重载，SQLite 零配置）"
	@echo "    make dev-admin       构建并托管管理台（静态服务器）"
	@echo "    make web             起 Flutter Web 主 App"
	@echo ""
	@echo "  测试/质量"
	@echo "    make test            全部测试（后端单测+e2e+前端）"
	@echo "    make test-backend    后端单测"
	@echo "    make test-frontend   Flutter 测试"
	@echo "    make lint            后端 lint"
	@echo ""
	@echo "  构建/部署"
	@echo "    make build           生产构建（Docker 镜像）"
	@echo "    make docker-up       Docker 一键起全部"
	@echo ""
	@echo "  数据库/运维"
	@echo "    make migrate         执行数据库迁移"
	@echo "    make migrate-generate 生成增量迁移"
	@echo "    make backup          数据库备份"
	@echo "    make db-redis        起 Redis（缓存/队列用）"
	@echo "    make clean           清理临时文件"

experience: ## 一键体验
	./deploy/experience.sh

dev: ## 本地开发起后端
	cd Server-Nodejs && cp -n .env.example .env 2>/dev/null || true
	cd Server-Nodejs && CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev

dev-admin: ## 构建并托管管理台
	cd Front-Taro-Admin && npm run build:h5
	@echo "→ 托管 dist/ 到 http://localhost:10086（可用任意静态服务器）"
	@echo "  无 python 时: npx http-server Front-Taro-Admin/dist -p 10086"

web: ## 起 Flutter Web 主 App
	cd Front-Flutter && flutter run -d chrome

test: test-backend test-frontend ## 全部测试
test-backend: ## 后端单测 + e2e
	cd Server-Nodejs && npm test
	cd Server-Nodejs && npm run test:e2e
test-frontend: ## Flutter 测试
	cd Front-Flutter && flutter test

lint: ## 后端 lint
	cd Server-Nodejs && npm run lint

build: ## 生产构建（Docker）
	docker compose build

docker-up: ## Docker 一键起全部
	docker compose up --build -d
	@echo "→ 主 App http://localhost  管理台 http://localhost/admin  健康 http://localhost:3000/api/v1/health"

migrate: ## 执行数据库迁移
	cd Server-Nodejs && npm run migration:run
migrate-generate: ## 生成增量迁移（NAME=xxx）
	cd Server-Nodejs && npm run migration:generate -- src/migrations/$(NAME)
backup: ## 数据库备份
	cd Server-Nodejs && npm run backup

db-redis: ## 起 Redis（缓存/队列）
	docker compose up redis -d

clean: ## 清理临时文件（体验脚本日志等）
	rm -f .experience-*.log
	@echo "cleaned"
