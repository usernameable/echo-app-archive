# Echo · 英语口语陪练

Echo 是面向小学五年级的平板英语口语陪练网页应用。孩子可选四个情境，听对话、跟读录音、对话接龙，并将自己的「今日一句」手动播放给家长。应用在本机运行，无需构建或安装项目依赖。

## 安装固定版本

当前公开安装包：`v0.9.4`。在另一台 Windows 电脑上，把这句话交给 AI 助手：

> 请下载并解压 `https://github.com/usernameable/echo-app-archive/archive/refs/tags/v0.9.4.zip`，把项目根目录命名为 `Echo`。检查本机是否已有 Chrome 和 Python 3，只安装缺少的；安装 Python 后确认 `python --version` 或 `py -3 --version` 能显示 Python 3。然后运行 `Echo/start.bat`，确认首页显示四个情境，并完成「演示前自检」的英文示范音和麦克风收音检查。无需安装 Git、Node 或项目依赖，也不要修改源码。

手动安装时，下载上述 ZIP，解压并将文件夹命名为 `Echo`，然后双击 `start.bat`。不要直接双击 `index.html`：ES Module 需要通过本地服务加载。启动脚本会在 8000–8002 中选可用端口并打开 Chrome。

## 更新

关闭 Echo 后，下载新版本 ZIP，用新文件替换本地 `Echo` 目录中的项目文件，再运行 `start.bat`。浏览器中的录音、进度和设置保存在原电脑的 IndexedDB / localStorage，不在 ZIP 中；换电脑时这些数据不会自动迁移。使用新版后请重新完成麦克风自检和一次真实录音回放。

设计基准为横屏 1280×800；验收环境为 Windows Chrome 的 `localhost`。英文示范音取决于浏览器和系统语音包；平板真机、HTTPS 与不同麦克风设备尚未逐项验收。

本仓库只包含运行应用所需文件、启动说明和字体许可证。`v0.9.4` 更新了接龙、小节回顾和休息流程。
