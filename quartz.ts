import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"
import { registerCondition } from "./quartz/plugins/loader/conditions"
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

// 日记体系（含 `/日记/` 时间线列表页和所有日记正文）不挂 Giscus 评论区。
//
// 为什么不能靠 CSS 隐藏：comments 组件的 afterDOMLoaded 被编译进
// static/scripts/script-2-*.js，里面的逻辑是
//   let e = document.querySelector(".giscus"); if (!e) return;
//   let t = document.createElement("script"); t.src = "https://giscus.app/client.js";
// 只要那个空壳 div 还在 HTML 里，它就会往里面注入 client.js、真的发起请求。
// display:none 拦不住这次请求，只是让人看不见而已。
//
// 走 layout.condition 而不是 frontmatter：config-loader.ts:795 对**任何**组件
// 都会套 applyConditionWrapper，而 conditions.ts 的 registerCondition 是导出的，
// 所以不用改核心文件就能注册自己的条件。条件为假时 ConditionalRender 直接
// 返回 null —— 服务端根本不输出 .giscus，脚本也就无从注入。
// ConditionalRender 同时转发了 afterDOMLoaded / css，所以 /有感/ 和普通文章
// 完全不受影响，照常挂载。
//
// 时机同上面的 filterFn：registerCondition 只是往 Map 里塞一条，真正的查表
// 发生在 loadQuartzConfig() → loadQuartzLayout() → applyConditionWrapper()，
// 所以必须写在 loadQuartzConfig() 之前。
registerCondition("not-diary", ({ fileData }) => {
  // 用 startsWith("日记/") 一条覆盖两种页面：
  //   `日记/index`（时间线列表）与 `日记/<某篇>`（正文）都以「日记/」开头。
  // 返回 true = 该组件渲染；false = 不渲染。
  const slug = fileData.slug ?? ""
  return !slug.startsWith("日记/")
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
