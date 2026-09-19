import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"
import { MomentsPageType } from "./quartz/plugins/pageTypes/moments"
import { DiaryDate } from "./quartz/plugins/transformers/diary-date"

// 侧栏（Explorer）里「日记」只保留文件夹这一条入口，下面什么都不列。
//
// Explorer 的导航树是在浏览器里按 contentIndex 现搭的——服务端只输出一个空的
// <ul class="explorer-ul">。唯一的过滤钩子是 filterFn，而它必须是**函数**：
// 服务端把 opts.filterFn.toString() 塞进 data-data-fns 属性，前端用
// new Function 还原。YAML 表达不了函数，schema 里也没有这一项，所以走 TS 侧的
// 选项覆盖。merge 顺序是 {...defaultOptions, ...entry.options, ...tsOverrides}，
// 覆盖排在最后，压得住插件自带的默认 filterFn。
//
// 时机很关键，而且反直觉：必须写在 loadQuartzConfig() **之前**。
// loadQuartzConfig 内部（config-loader.ts:512）自己就会调一次 loadQuartzLayout()，
// 把布局烘进 PageTypeDispatcher——那才是页面真正用的布局。写在它后面的话，
// 组件早按默认 filterFn 实例化完了，覆盖表再也不会被读到（实测：写在后面时
// instantiate 确实收到了 filterFn，但产出的 HTML 里仍是默认值）。
//
// 注意 filterFn 会被序列化后在前端重建，所以它必须自包含，不能闭包外部变量。
componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  filterFn: (node: { slugSegment: string; slugSegments: string[]; isFolder: boolean }) =>
    // 保留插件原本的默认行为：隐藏顶层 tags 节点。漏掉这行 tags 会冒出来。
    node.slugSegment !== "tags" &&
    // 日记：只留「日记」文件夹根节点本身（它的 slugSegments 是 ["日记"]，
    // 长度为 1）。它下面的一切——笔记、以及以后可能建的子文件夹——长度都 > 1，
    // 一律丢掉。filter 是 `children.filter(fn)` 后再递归，被丢掉的节点连同
    // 整棵子树一起消失，不会进 DOM。加上长度判断是为了子文件夹也一并收掉，
    // 否则子文件夹节点会自己留下来变成一个空的可展开项。
    !(node.slugSegments[0] === "日记" && node.slugSegments.length > 1),
})

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
