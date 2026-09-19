import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { MomentsPageType } from "./quartz/plugins/pageTypes/moments"
import { DiaryDate } from "./quartz/plugins/transformers/diary-date"

const config = await loadQuartzConfig()

// 日记的日期与标题取自文件名（`2026-09-19 今天的测试.md`）。
// 顺序很关键：config-loader 只对 quartz.config.yaml 里声明的插件按 order 排序，
// 这里 push 进来的排在 transformers 数组末尾，因此一定在
// @quartz-community/created-modified-date（order: 10）之后运行——DiaryDate
// 的最低优先级要读它写好的 dates。
config.plugins.transformers.push(DiaryDate())

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
