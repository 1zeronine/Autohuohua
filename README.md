# 抖音自动续火花

基于 Playwright 的抖音网页版自动续火花工具，每天定时给好友发送消息，保持火花不断。

## 环境要求

- **Node.js**（去 [nodejs.org](https://nodejs.org) 下载安装，LTS 版本即可）
- 如果要用命令行克隆，还需要 **Git**

## 快速开始

### 1. 下载项目

**方法 A（推荐，无需 Git）**：打开 https://github.com/1zeronine/Autohuohua，点绿色 **Code** 按钮 → **Download ZIP**，解压到任意目录。

**方法 B（需要 Git）**：在命令行中运行：

```bash
git clone git@github.com:1zeronine/Autohuohua.git
cd Autohuohua
```

### 2. 安装依赖

双击 `setup.bat`，或在项目目录下打开命令行执行：

```bash
npm install
npx playwright install chromium
```

### 3. 配置好友

编辑 `config.json`：

```json
{
  "friends": ["好友昵称1", "好友昵称2"],
  "message": "🔥",
  "headless": false
}
```

| 配置项 | 说明 |
|--------|------|
| `friends` | 需要续火花的好友昵称（抖音网页版显示的昵称） |
| `message` | 发送的消息内容，默认 🔥 |
| `headless` | `true` 后台静默运行，`false` 显示浏览器窗口 |

### 4. 首次登录

双击 `run.bat`，弹出浏览器后扫码登录抖音。登录态会被保存，后续无需重复登录。

### 5. 设置定时任务

编辑 `schedule.ps1` 中的执行时间：

```powershell
$hour = 16
$minute = 30
```

以**管理员身份**打开 PowerShell，运行：

```powershell
D:\Autohuohua\schedule.ps1
```

### 6. 切换无头模式

首次登录成功后，把 `config.json` 中 `headless` 改为 `true`，定时任务会在后台静默执行。

## 手动运行

双击 `run.bat` 即可手动执行一次。

## 查看日志

打开 `C:\Users\你的用户名\run.log` 查看执行记录。

## 目录结构

```
├── index.js          # 核心脚本
├── config.json       # 配置文件
├── run.bat           # 手动运行入口
├── run.ps1           # PowerShell 执行脚本
├── schedule.ps1      # 创建/更新定时任务
├── setup.bat         # 首次安装依赖
├── package.json      # Node.js 项目配置
└── browser-data/     # 浏览器登录态（自动生成）
```

## 常见问题

**Q: 提示未找到好友？**
A: 检查 `config.json` 中 `friends` 的昵称是否与抖音网页版显示完全一致。

**Q: 登录过期了怎么办？**
A: 把 `headless` 改回 `false`，双击 `run.bat` 重新扫码登录。

**Q: 定时任务没有执行？**
A: 检查 `C:\Users\你的用户名\run.log`，确保当前创建时间在定时时间之前。

## 注意事项

- 电脑需要保持开机状态才能触发定时任务
- 抖音网页版 DOM 结构可能变化，若脚本失效需更新选择器
- 本工具仅供学习交流，请勿用于违规用途
