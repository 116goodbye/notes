import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { MomentsPageType } from "./quartz/plugins/pageTypes/moments"

const config = await loadQuartzConfig()

// 「动态」页（朋友圈式信息流）。走虚拟页，不在 content/ 里放任何文件——
// content/ 由 sync-content.ps1 用 robocopy /MIR 镜像（含删除），放进去的文件
// 下次发布就会被删掉。这里直接推插件实例，也避开了 plugin loader 在 Windows
// 上给本地插件建 symlink 的权限问题。
config.plugins.pageTypes ??= []
config.plugins.pageTypes.push(
  MomentsPageType({
    slug: "moments",
    title: "动态",
    folders: ["随记"],
    limit: 100,
    excerptLength: 200,
    maxImages: 9,
  }),
)

export default config
export const layout = await loadQuartzLayout()
