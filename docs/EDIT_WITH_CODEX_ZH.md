# 用 Codex 本地 App 修改这个网站

核对日期：2026-10-23。App 版本、语言和工作区策略会影响按钮名称。

## 1. 先理解三件事

Codex 修改的是你授权打开的项目文件夹。GitHub 保存远端仓库。GitHub Pages 把发布分支中的网站文件发布成网页。

最适合本项目的流程：

你用中文提要求 → Codex 修改本地 HTML/CSS/JS → 本地浏览器预览 → 检查差异 → commit → push → Pages 部署。

不需要把这个静态网站做成 API，也不必先创建 Codex Cloud 环境。
本 ChatGPT 对话中的“路径规划项目”不等于你电脑上的本地源码文件夹；不能只靠同名项目假定 Codex 已拿到网站文件。

## 2. 准备唯一的工作目录

### 网站已经在 GitHub 上

1. 打开 GitHub Desktop 并登录你的网站仓库所属 GitHub 账号。
2. `File → Clone repository`，选择现有网站仓库；或在 GitHub 仓库点击 `Code → Open with GitHub Desktop`。
3. 将本地位置设在固定目录，例如 `D:\portfolio\zehao-site`。这只是示例，可以使用已有路径。
4. 克隆后确认里面有 `index.html`、`assets`；如果发布源实际在子目录，需要打开正确目录。
5. 已经有本地克隆时，不要再新建另一个无关副本。先保存当前改动，必要时用 `Fetch origin / Pull origin` 同步远端。
6. 把本次 ZIP 解压后目录内的内容复制到这份克隆里。保留 `.git`、`CNAME`、已有 `.github` 和其他你自行配置的文件。已经自行修改过页面时，先备份/提交，再检查差异，而不是直接覆盖个人改动。

### 还没上传到 GitHub

先把 ZIP 完整解压到固定目录，就可以让 Codex 在本地修改和预览。
以后再用 GitHub Desktop 创建/添加本地仓库并发布；不要为了启动本地编辑先配置云端。
若以后已有远端仓库，请克隆它并迁移文件，不要再创建一个同内容但独立的 Git 历史。

## 3. 在已下载的 App 中打开网站

1. 启动已安装的 Codex / ChatGPT 桌面 App，使用 ChatGPT 账号登录。
2. 新版桌面 App 可能把入口放在左上角下拉菜单：选择 **Codex**；旧界面可能直接显示 Codex 工作区。
3. 选择 **Open folder / Add new project / 打开文件夹**，打开上一步的目录。Windows 文档也提供 `Ctrl+O` 添加本地项目。较新项目界面也可能通过 **Edit project → Add folder** 添加本地目录，并设为主目录。若弹出的只是上传单个文件窗口，退回本地项目/文件夹入口。
4. 确认选择的是直接包含 `index.html`、`assets/`、`AGENTS.md` 的文件夹，不是 ZIP、下载文件夹或某一个 HTML 文件。
5. 开始新任务，选择 **Local**；新版可能写为 **Work in → This computer**。本次先不要选择 Cloud；也先不启用 Worktree，避免预览的是另一份工作目录。
6. 保留沙箱和“需要时请求批准”。只授权这个项目必要的读写与预览命令；不需要开启全磁盘无限权限。

Windows 原生模式即可用于这个网站，不必为了修改网页先进入 Ubuntu、WSL 或 VMware。
使用 ChatGPT 账号登录 Codex 与 GitHub 登录是两个独立环节；使用 ChatGPT 订阅登录并不要求你先购买 API Key。

首次输入：

```text
请先读取 AGENTS.md 和 README.md。
先不要修改文件，执行以下检查：
1. 输出当前工作目录，确认 index.html、ccpp.html、farm-carrier.html 和 assets 是否存在。
2. 说明这是不是纯静态网站，以及本地预览怎样启动。
3. 若当前目录是 Git 仓库，查看 git status 和 remote 配置；不要修改 remote。
4. 说明要修改首页文案、项目介绍和全站样式分别涉及哪些文件。
暂时不要安装依赖、提交或推送。
```

看到正确目录和文件后，就建立了本地工作关联。没有必要另找“连接网页”按钮。

## 4. 让 Codex 真正修改文件

任务最好明确“改哪里、改成什么、哪些不动、怎样验收”。例如：

```text
请直接修改当前网站文件，不要只给出建议。
将首页个人介绍改为：
“车辆工程背景，关注机器人路径规划、多机协同与 ROS 2 系统集成。”
保留姓名、教育经历、联系方式、两个项目的动图和交互功能。
只改必要的 HTML/CSS，不新增框架、外部字体、表格或统计面板。
完成后运行 python tools/check_site.py。
告诉我修改了哪些文件和预览方法。不要 commit，不要 push。
```

修改布局的例子：

```text
请把首页两个项目卡片的图像区域放大，说明文字各保留两句话以内。
手机端保持单列，按钮不能挤出屏幕。
不要改 assets/data、assets/source、assets/downloads 或视频文件。
保留项目页链接和所有回放功能。
请检查桌面及手机视口；未实际执行的测试要说明。不要发布。
```

用截图反馈的例子：

```text
这是当前手机截图。请只修复我指出的部分：调度树的按钮太密、标题换行不自然。
不要重做整个网站，也不要删除完整的 Agent 子树或状态机。
```

一次处理一个清晰的目标，比“帮我把网站做好看一些”更容易检验。

## 5. 预览和查看差异

在项目目录双击 `START_PREVIEW.cmd`；或在 Codex 集成终端 / PowerShell 运行：

```powershell
cd D:\portfolio\zehao-site
py -3 preview_server.py
```

已有 Python 3 时无需重复安装。`py` 不可用但 `python` 可用时，改为：

```powershell
python preview_server.py
```

默认预览地址为 `http://127.0.0.1:8000/`。端口占用时脚本会选择其他空闲端口，以窗口实际打印地址为准。
保留终端窗口，停止时按 `Ctrl+C`。修改后刷新网页；缓存没有更新时使用 `Ctrl+F5`。
这是一份静态站，不需要 `npm install` / `npm run dev`；Java 只用于另行运行仿真，不用于网站预览。

检查首页、两项演示的播放/暂停、场景切换、树展开、机器人选择和手机宽度。
Codex 的 review pane 需要 Git 仓库；也可在 GitHub Desktop 的 Changes 中查看具体修改。
使用 `/review` 可请求代码审查，但审查不能替代浏览器实测。

## 6. 更新已发布网站

确认改动后，在 GitHub Desktop：

1. 打开正确仓库，检查 Changes；不要夹带密码、Token、私密资料或不相关源码。
2. 写提交说明，例如 `Simplify project presentation`。
3. 点击 `Commit to main`（实际名称取决于当前分支）。这只保存本地 Git 历史。
4. 点击 `Push origin`。这才把提交发送到 GitHub。
5. 如果 Pages 从 `main / (root)` 发布，确认该分支的 Pages 部署成功后再检查在线网页。已有其他发布配置时应沿用实际配置。

在受保护分支工作时，应使用修改分支并创建 Pull Request，合并到发布分支后部署。
切勿为解决冲突直接 force push。先查看远端新提交并正常同步。

也可以让 Codex 执行 Git 命令，但要具备本机 Git/GitHub 身份验证，并明确授权发布。例如：

```text
我已经检查并确认这次网页改动。请先显示当前分支、origin 和待提交文件。
仅提交本次网站修改，提交说明用 Simplify project presentation。
确认没有其他人的未提交改动后，再推送到当前已配置的上游分支。
不要修改 remote，不要强制推送，不要删除任何文件。
推送失败就停下并说明原因。
```

本地编辑不需要 GitHub 插件。用 GitHub Desktop 发布时也不需要先把 GitHub 连接到 ChatGPT。
若要使用 Codex 内建的 GitHub 特定功能，可按官方 Windows 文档配置 GitHub CLI：安装后运行 `gh auth login`，在自己的浏览器完成授权；不要把 Token 粘进聊天。

## 7. 常见问题

**App 只回答建议，没有实际改动。**
检查是不是 Codex 模式、是否已经打开本地目录、是否处于只读/计划模式，提示词中明确“直接修改当前项目文件”。

**Codex 改好了，浏览器却没变化。**
先核对它修改的绝对目录与你预览服务器使用的目录是否一致。Worktree 模式会产生独立工作目录。再检查缓存。

**本地变了，线上没变。**
检查是否 commit 后又 push、是否推送到了 Pages 的发布分支，以及部署是否成功。

**只能看到 GitHub 文件列表，没看到网站。**
仓库页面不是 GitHub Pages 地址，需要启用 Pages 并访问部署地址。

**之前的 chatgpt.site 网站会同步更新吗？**
不会因为本地文件或 GitHub Pages 更新而自动同步。它属于另一个部署目标；本指南以 GitHub Pages 为发布目标。

**需要改哪个文件？**
首页文字和项目卡片在 `index.html`；两项项目介绍在 `ccpp.html` / `farm-carrier.html`；统一样式优先改 `assets/portfolio.css`；标签切换在 `assets/portfolio.js`。
地图/轨迹/状态图逻辑分别在 `assets/farm.js`、`assets/replay.js`、`assets/farm-graphs.js`。
改简介不需要改数据文件。改回放内容则必须重新生成真实结果，不能手工编造。

## 官方依据

以下来源为本次查询依据；界面更新后以实际 App 与官方文档为准。

- OpenAI：Using Codex with your ChatGPT plan
  https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- OpenAI：ChatGPT desktop app for Windows
  https://learn.chatgpt.com/docs/windows/windows-app
- OpenAI：Codex environments（Local / Worktree / Cloud）
  https://learn.chatgpt.com/docs/environments/modes
- OpenAI：Projects and chats
  https://learn.chatgpt.com/docs/projects
- OpenAI：Custom instructions with AGENTS.md
  https://learn.chatgpt.com/docs/agent-configuration/agents-md
- OpenAI：Code review
  https://learn.chatgpt.com/docs/code-review
- GitHub：Cloning a repository to GitHub Desktop
  https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-a-repository-from-github-to-github-desktop
- GitHub：Pushing changes from GitHub Desktop
  https://docs.github.com/en/desktop/making-changes-in-a-branch/pushing-changes-to-github-from-github-desktop
- GitHub：Configuring a publishing source for GitHub Pages
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
# 三项目合并版补充

本文件后续内容是原精简包的编辑指南。当前工程已接入完整的精简 ROS 2 项目：页面为 `ros2.html`，标签逻辑为 `assets/ros2-concise.js`，三项目布局覆盖样式为 `assets/merged.css`。最新入口与检查方式以根目录 `README.md` 为准。原指南中的 ROS 2 占位或未接入描述不适用于本合并版。

