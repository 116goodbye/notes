import { Root } from "mdast"
import { VFile } from "vfile"
import { QuartzTransformerPlugin } from "../types"
import { QuartzPluginData } from "../vfile"

/**
 * 日记的日期与标题取自文件名（`2026-09-19 今天的测试.md`）。
 *
 * 为什么要单独做这件事：
 * @quartz-community/created-modified-date 只认 frontmatter / git / 文件系统
 * 三个日期来源，**从不解析文件名**；而 git 那一支在 Cloudflare Pages 的浅克隆
 * （`--depth 1`）下，对任何文件都返回 tip commit 的时间。也就是说，日记文件名
 * 里明明写着权威日期，站点却会显示出「最后一次推送的日期」。让每篇日记再手写
 * 一遍 frontmatter date 是冗余的——文件名已经是唯一的日期来源了。
 *
 * 本插件只碰 relativePath 以「日记/」开头的文件，其他目录（有感/ 等）一概不动：
 *   1. 定日期，优先级：frontmatter.date → 文件名 YYYY-MM-DD → 原有 dates.modified
 *   2. 写回 file.data.dates 与 defaultDateType，folder-page 的排序和日期显示
 *      读的正是这两个字段，所以它们会自动跟随，无需改 folder-page
 *   3. 清掉 frontmatter.title 里重复的日期前缀（只清文件名里那一个日期，
 *      且仅在后面还有正文时才清，`2026-09-19.md` 的标题保持原样）
 *
 * 运行顺序要求：必须排在 created-modified-date（YAML 里 order: 10）之后，
 * 因为第 3 优先级要读它写好的 dates。注册方式见 quartz.ts——直接 push 进
 * config.plugins.transformers：config-loader 只对 YAML 里声明的插件按 order
 * 排序，push 进来的实例排在数组末尾，所以顺序天然满足。
 */
export const DiaryDate: QuartzTransformerPlugin = () => {
  return {
    name: "DiaryDate",
    markdownPlugins() {
      return [
        () => {
          return (_tree: Root, file: VFile) => {
            const data = file.data as QuartzPluginData

            const relativePath = typeof data.relativePath === "string" ? data.relativePath : ""
            if (!relativePath.startsWith(DIARY_PREFIX)) {
              return
            }

            const filename = relativePath.split("/").pop() ?? ""
            const filenameDate = parseFilenameDate(filename)
            const frontmatter = (data.frontmatter ?? {}) as Record<string, unknown>
            const existing = (data.dates ?? {}) as Record<string, unknown>

            // 优先级：frontmatter.date → 文件名 → 原有 dates.modified → 原有 dates.created
            const resolved =
              toDate(frontmatter.date) ??
              filenameDate ??
              toDate(existing.modified) ??
              toDate(existing.created)

            // 三个来源都认不出来（文件名没有日期、也没有 frontmatter），
            // 就把上游插件写好的值原样留着，不要用垃圾值覆盖。
            if (!resolved) {
              return
            }

            data.dates = {
              // created / published 若在 frontmatter 里显式写了就尊重它
              // （note-properties 已把 date 别名进这两个字段），否则跟随日记日期。
              created: toDate(frontmatter.created) ?? resolved,
              modified: resolved,
              published: toDate(frontmatter.published) ?? resolved,
            }
            data.defaultDateType = "modified"

            stripDatePrefix(frontmatter, filename, filenameDate)
          }
        },
      ]
    },
  }
}

/** 只处理这个目录下的文件（content/ 下的相对路径前缀）。 */
const DIARY_PREFIX = "日记/"

/** 文件名里的日期。只认 YYYY-MM-DD，且必须出现在文件名中。 */
const FILENAME_DATE = /(\d{4})-(\d{2})-(\d{2})/

function parseFilenameDate(filename: string): Date | undefined {
  const m = filename.match(FILENAME_DATE)
  if (!m) {
    return undefined
  }
  const [, year, month, day] = m
  // 挡掉 2026-13-45 这种形状对但不存在的东西
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) {
    return undefined
  }
  // 用正午而不是零点：零点在时区偏移下会退到前一天，正午有 12 小时余量。
  const date = new Date(`${year}-${month}-${day}T12:00:00`)
  return isNaN(date.getTime()) ? undefined : date
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    return isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

/**
 * 把标题里重复的日期前缀去掉：`2026-09-19 今天的测试` → `今天的测试`。
 *
 * 只有当标题**以文件名里那一个日期开头**、且日期之后还有非分隔符内容时才清，
 * 所以「我的 2026-09-19 日记」这类正常标题不会被误伤；文件名只有日期
 * （`2026-09-19.md`）时清完是空串，也保持原样。
 */
function stripDatePrefix(
  frontmatter: Record<string, unknown>,
  filename: string,
  date: Date | undefined,
): void {
  const title = frontmatter.title
  if (!date || typeof title !== "string") {
    return
  }
  const prefix = filename.match(FILENAME_DATE)?.[0]
  if (!prefix || !title.startsWith(prefix)) {
    return
  }
  const rest = title
    .slice(prefix.length)
    .replace(/^[\s_\-–—]+/, "")
    .trim()
  if (rest.length > 0) {
    frontmatter.title = rest
  }
}
