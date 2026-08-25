# Echo Flow

本地优先的桌面端听力 / 跟读练习应用。

Echo Flow 帮助你打开音频材料，自动转写字幕，按句精听，并在跟读模式中录音、对比波形，完成口语 shadowing 练习。音频解码、播放、录音与转写都在本地完成，模型可按需下载管理。

## 功能

- **听力模式（Listening）**
  - 打开本地音频，播放控制、进度跳转与音量调节
  - 按句浏览脚本，空格快捷播放 / 暂停
  - 字幕与转写结果联动展示

- **跟读模式（Shadowing）**
  - 逐句播放原音、录音、回放
  - 原音与用户录音波形对比
  - 快捷键：`←` / `→` 切句，`Space` 播放原句，`R` 录音，`C` 对比回放，`Esc` 返回听力模式

- **本地语音转写**
  - Whisper（ggml）离线 ASR
  - Silero VAD 语音活动检测
  - wav2vec2 强制对齐，提升句级时间戳质量
  - 转写结果缓存，避免重复计算

- **模型与设备管理**
  - 设置中下载 / 删除 Whisper 与辅助模型
  - 自定义模型目录与缓存目录
  - 选择输入 / 输出音频设备，支持设备热插拔提示

- **桌面体验**
  - 浅色 / 深色主题
  - 自定义标题栏与侧边栏文件列表
  - Tauri 2 原生桌面壳

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri v2 |
| 前端 | Vue 3、TypeScript、Vite 6、Pinia、Tailwind CSS 4 |
| 后端 | Rust 2021 |
| 音频 | symphonia、rodio、cpal、hound |
| 语音 / ML | whisper-rs、sentencex、ort（ONNX）、ndarray |

## 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) stable
- 对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)

首次转写前，需要在应用设置中下载至少一个 Whisper 模型，以及 Silero VAD 等辅助模型。

可选 Whisper 体积参考：

| 模型 | 约大小 |
|------|--------|
| Tiny | 75MB |
| Base | 142MB |
| Small | 466MB |
| Medium | 1.5GB |

## 快速开始

```bash
# 安装前端依赖
npm install

# 启动完整桌面应用（推荐）
npm run tauri dev
```

仅开发前端界面：

```bash
npm run dev
```

生产构建：

```bash
npm run tauri build
```

## 使用流程

1. 启动应用后，打开本地音频文件。
2. 进入 **Settings → Model Downloads**，下载 Whisper 模型与 Silero VAD。
3. 触发转写，等待本地生成字幕 / 句子时间轴。
4. 在 **Listening** 模式精听，按句定位内容。
5. 点击 **Start Speaking Practice** 进入 **Shadowing** 模式：
   - 听原句
   - 录音跟读
   - 对比波形与回放

## 项目结构

```text
src/                 Vue 前端
  components/        按功能划分的 UI（layout / listening / shadowing）
  composables/       Tauri 事件订阅与可复用副作用
  stores/            Pinia 领域状态
  views/             设置等顶层视图
src-tauri/           Rust / Tauri 后端
  src/audio.rs       解码、播放、波形、字幕 I/O
  src/record.rs      输入设备与录音
  src/devices.rs     设备监听 / 热插拔
  src/transcribe/    ASR、VAD、对齐、缓存
  src/download.rs    模型下载与管理
docs/                设计说明与实现计划
```

约定：界面与交互在 `src/`；音频引擎、转写、模型与文件系统相关能力在 `src-tauri/`。前端通过 Tauri commands / events 访问原生能力。

## 常用命令

```bash
npm run dev              # 仅 Vite 前端（端口 1420）
npm run build            # 类型检查 + 前端生产构建
npm run test             # Vitest
npm run tauri dev        # 完整桌面应用开发模式
npm run tauri build      # 打包桌面应用

# 在 src-tauri/ 下
cargo fmt --check
cargo check
cargo test
```

## 开发提示

- 推荐 IDE：VS Code / Cursor + Vue Official + Tauri + rust-analyzer
- 前端组件使用 `<script setup lang="ts">` 与 Composition API
- 领域状态放在 Pinia store；跨组件的 Tauri 事件监听放在 composable
- 长任务（转写、下载、波形预处理）在 Rust 侧异步执行，并通过事件回报进度

## 状态

当前版本 `0.1.0`，仍在积极开发中。API、界面与模型管线可能发生变化。

## License

尚未添加开源许可证。若你计划基于本仓库二次分发，请先与维护者确认。
