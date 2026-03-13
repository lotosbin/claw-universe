# 贡献指南

欢迎！本项目包含 Claude Code 桌面宠物钩子和工具。

## 快速开始

1. **克隆仓库**
   ```bash
   git clone <仓库地址>
   cd claw-universe
   ```

2. **安装依赖**
   ```bash
   # hooks
   cd hooks && npm install

   # server
   cd server && npm install
   ```

## 项目结构

- `hooks/` - Claude Code 桌面宠物集成钩子
- `server/` - 宠物状态仪表盘 Node.js 服务器

## 运行测试

```bash
# 运行 server 测试
cd server && npm test
```

## 代码规范

- 使用一致的代码风格
- 为新功能添加测试
- 保持更改专注且最小化
- 提交信息清晰明了

## 提交更改

1. 创建功能分支
2. 进行更改
3. 运行测试确保通过
4. 提交 Pull Request
