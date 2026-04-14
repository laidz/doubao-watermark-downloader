# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Tampermonkey 用户脚本，用于下载豆包（doubao.com）生成的无水印图片。脚本通过合并预览图和剪贴板复制图来精确去除左上角的水印区域。

## 核心架构

脚本的架构采用模块化设计，主要包含以下核心组件：

### 常量配置区
- `SELECTORS` - DOM 选择器映射，用于定位豆包页面的各种元素
- `TEXTS` - UI 文本配置，支持多语言扩展
- `TIMEOUTS` - 各种延迟和超时配置
- `ICONS` - SVG 图标资源
- 水印尺寸常量：`WATERMARK_WIDTH = 400`, `WATERMARK_HEIGHT = 200`

### 核心功能模块
1. **图片处理模块**
   - `getPreviewImage()` - 获取预览图元素
   - `getPreviewDimensions()` - 获取图片真实尺寸
   - `generateFilename()` - 基于日期和尺寸生成文件名

2. **UI 注入模块**
   - `addStyles()` - 注入自定义 CSS 样式
   - `showModal()`/`hideModal()` - 高级下载设置弹窗
   - `showLoading()`/`hideLoading()` - 加载提示

3. **事件处理模块**
   - `handleRightClick()` - 右键菜单拦截和按钮注入
   - `observeMenuAndAddButton()` - 使用 MutationObserver 监听动态菜单
   - `handleDownload()`/`handleAdvancedDownload()` - 下载处理逻辑

4. **Canvas 处理模块**
   - 合并预览图和剪贴板图片
   - 精确裁剪左上角水印区域
   - 支持 JPG/PNG 格式输出和质量控制

## 开发工作流

### 本地测试
由于这是 Tampermonkey 脚本，测试流程：
1. 在浏览器中安装 Tampermonkey 扩展
2. 导入脚本文件进行测试
3. 修改后需要重新加载脚本

### 版本发布
1. 更新脚本头部版本号（`@version`）
2. 更新 README.md 中的更新日志
3. 使用 git 提交并推送：
   ```bash
   git add .
   git commit -m "描述修改"
   git push github main
   ```

## 关键技术实现

### 去水印原理
1. 豆包的预览图是带水印的低清版本
2. 脚本触发"复制"功能，将高清图片存入剪贴板
3. 使用 Canvas API 读取剪贴板图片数据
4. 合并两张图片，精确覆盖水印区域（左上角 400x200 像素）

### 选择器策略
脚本使用部分匹配的选择器（如 `[class^="context-menu-item-"]`）来提高抗变更性。

### 状态管理
- `isProcessing` 全局标志防止重复处理
- `menuObserver` 自动断开连接避免内存泄漏

## 豆包页面结构理解

脚本依赖的豆包页面结构：
- 图片预览面板：`aside.relative`
- 右键菜单容器：`.semi-dropdown-content`
- 预览图片：`img[alt="preview"]`
- 复制按钮包含文本"复制"

## 注意事项

- 脚本仅在 doubao.com 域名下运行
- 需要剪贴板权限（Safari 需要手动授权）
- 支持的浏览器：Chrome、Firefox、Edge、Safari
- 水印位置固定在图片左上角 400x200 区域