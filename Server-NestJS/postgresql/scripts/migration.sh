# SPDX-License-Identifier: Apache-2.0

 #!/bin/bash
 # =============================================================
 # TypeORM 迁移命令集
 # 用法: bash postgresql/scripts/migration.sh <command>
 # 命令: generate | run | revert | show
 # =============================================================
 
 set -e
 MIGRATIONS_DIR="./src/migrations"
 DATA_SOURCE="./src/config/typeorm-data-source.ts"
 
 case "${1:-help}" in
   generate)
     NAME="${2:-migration}"
     echo "Generating migration: $NAME"
     npx typeorm-ts-node-commonjs migration:generate "$MIGRATIONS_DIR/$NAME" \
       -d "$DATA_SOURCE"
     ;;
   run)
     echo "Running pending migrations..."
     npx typeorm-ts-node-commonjs migration:run -d "$DATA_SOURCE"
     ;;
   revert)
     echo "Reverting last migration..."
     npx typeorm-ts-node-commonjs migration:revert -d "$DATA_SOURCE"
     ;;
   show)
     echo "Showing migration status..."
     npx typeorm-ts-node-commonjs migration:show -d "$DATA_SOURCE"
     ;;
   *)
     echo "Usage: $0 {generate|run|revert|show} [migration-name]"
     echo ""
     echo "Commands:"
     echo "  generate [name]  创建新迁移文件"
     echo "  run              执行待处理迁移"
     echo "  revert           回滚上一次迁移"
     echo "  show             查看迁移状态"
     ;;
 esac
