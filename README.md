# SpaceAI 智能磁盘分析清理工具

SpaceAI 是一款智能磁盘分析清理工具，帮助用户直观地分析磁盘空间使用情况，并提供 AI 驱动的文件风险评估和自动清理功能。

## 核心功能

### 🎨 可视化空间分析
- 告别枯燥列表，用直观色块洞察硬盘占用
- 支持磁盘和子目录的深入扫描
- 实时显示扫描进度和当前路径

### 🤖 AI 智能风险评估
- 右键任意文件，AI 为你通俗解释用途并评估删除风险
- 提供专业的文件分类和操作建议
- 基于文件路径和类型的智能分析

### 🛡️ 隔离沙箱防误删
- 误删随时找回，15天后自动物理释放
- 安全删除文件到隔离沙箱
- 支持文件还原功能

### ⏳ 自动化定期清理
- 自定义清理周期与目标路径，省心省力
- 支持当天、每周、每两周、每月等清理周期
- 提供建议清理项，如临时文件、下载文件夹等

## 技术栈

- **前端**：Electron + HTML + CSS + JavaScript
- **后端**：Python
- **依赖**：
  - Electron：桌面应用框架
  - node-schedule：任务调度
  - PyInstaller：Python 打包
  - electron-packager：Electron 打包

## 安装步骤

### 方法 1：直接运行打包好的应用（推荐）

1. 从 [Releases](https://github.com/qiu58/spaceai-cleaner/releases/tag/v1.0.0) 页面下载最新的安装包
2. 双击安装包进行安装
3. 运行 SpaceAI 应用

### 方法 2：从源码构建

#### 环境要求
- Python 3.8+
- Node.js 12+
- npm

#### 构建步骤

1. **克隆仓库**：
   ```bash
   git clone https://github.com/yourusername/spaceai-cleaner.git
   cd spaceai-cleaner
   ```

2. **安装 Python 依赖**：
   ```bash
   pip install -r requirements.txt
   ```

3. **安装 Node.js 依赖**：
   ```bash
   npm install
   ```

4. **打包 Python 后端**：
   ```bash
   python -m PyInstaller --onefile --noconsole --name spaceai-backend.exe main.py
   ```

5. **打包 Electron 前端**：
   ```bash
   npx electron-packager@15.4.0 . SpaceAI --platform=win32 --arch=x64 --out=dist/electron --overwrite
   ```

6. **复制 Python 后端到打包目录**：
   ```bash
   copy dist\spaceai-backend.exe dist\electron\SpaceAI-win32-x64\
   ```

7. **运行应用**：
   ```bash
   dist\electron\SpaceAI-win32-x64\SpaceAI.exe
   ```

## 使用说明

### 首次启动
- 首次启动时会显示新手引导弹窗，介绍核心功能
- 点击「开始体验」进入主界面

### 扫描磁盘
1. 在首页选择要扫描的磁盘（C盘或D盘）
2. 点击「开始扫描」按钮
3. 等待扫描完成，查看磁盘空间使用情况

### 分析文件
1. 在扫描结果中，右键点击任意色块
2. 选择「AI 解释」查看文件的详细分析
3. 选择「安全删除」将文件移至隔离沙箱

### 管理任务
1. 点击「自动清理」标签页
2. 点击「浏览」选择要清理的文件夹
3. 选择清理周期和时间
4. 点击「添加任务」保存任务
5. 点击「立即执行」手动执行任务

### 管理回收站
1. 点击「回收站」标签页
2. 查看已删除的文件
3. 点击「还原」恢复文件
4. 点击「清空回收站并释放空间」永久删除所有文件

## 常见问题

### 问题 1：打包时遇到 Node.js 版本兼容性问题
**解决方案**：使用与您的 Node.js 版本兼容的 electron-packager 版本，例如：
```bash
npx electron-packager@15.4.0 . SpaceAI --platform=win32 --arch=x64 --out=dist/electron --overwrite
```

### 问题 2：Python 后端无法启动
**解决方案**：确保 `spaceai-backend.exe` 与 `SpaceAI.exe` 在同一目录下

### 问题 3：扫描时出现权限错误
**解决方案**：以管理员身份运行应用
