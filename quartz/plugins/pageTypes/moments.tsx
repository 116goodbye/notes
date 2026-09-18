import type { Nodes } from "hast"
import { GlobalConfiguration } from "../../cfg"
import { formatDate } from "../../components/Date"
import MomentsConstructor, { MomentItem } from "../../components/Moments"
import { BuildCtx } from "../../util/ctx"
import {
  FilePath,
  FullSlug,
  isAbsoluteURL,
  resolveRelative,
  slugifyFilePath,
} from "../../util/path"
import { QuartzPageTypePlugin, VirtualPage } from "../types"
import { defaultProcessedContent, ProcessedContent, QuartzPluginData } from "../vfile"
import { match } from "./matchers"

export type MomentsOptions = {
  /** 虚拟页 slug，决定网址（moments → /moments） */
  slug: string
  /** 页面标题（中文） */
  title: string
  /** 收录哪些文件夹下的笔记 */
  folders: string[]
  /** 额外收录带这些 frontmatter 标签的笔记 */
  tags: string[]
  limit: number
  /** 摘要最大长度（按码点截断，不会劈开 emoji） */
  excerptLength: number
  maxImages: number
}

const defaults: MomentsOptions = {
  slug: "moments",
  title: "动态",
  folders: ["随记"],
  tags: [],
  limit: 100,
  excerptLength: 200,
  maxImages: 9,
}

/** 这些标签下的文本不属于「正文」，摘录时跳过 */
const SKIP_TAGS = new Set(["pre", "code", "script", "style"])
/** transclude = ![[别的笔记]] 展开出来的占位块；footnotes = 脚注区 */
const SKIP_CLASSES = new Set(["transclude", "footnotes"])

/**
 * 把笔记页里的图片地址换算成「相对 feed 页」的地址。
 *
 * crawl-links 已经把它变成了相对**笔记页**的 URL（如 `../附件/图片.png`），
 * 这里要按 crawl-links 自己的手法反解回站点绝对路径，再重新相对到 feed 页。
 * 必须 decodeURIComponent：`new URL` 会把中文/空格百分号编码，不还原就会 404。
 */
function toFeedSrc(raw: string, noteSlug: FullSlug, feedSlug: FullSlug): string {
  if (isAbsoluteURL(raw) || raw.startsWith("#")) return raw

  let imageSlug: string
  try {
    const abs = new URL(raw, `https://q/${noteSlug}`).pathname
    imageSlug = decodeURIComponent(abs).replace(/^\//, "")
  } catch {
    imageSlug = raw.replace(/^\.\//, "")
  }
  return resolveRelative(feedSlug, imageSlug as FullSlug)
}

type Extracted = { images: string[]; text: string[] }

function walk(node: Nodes, out: Extracted, noteSlug: FullSlug, feedSlug: FullSlug): void {
  if (node.type === "text") {
    out.text.push(node.value)
    return
  }
  if (node.type !== "element" && node.type !== "root") return

  if (node.type === "element") {
    if (SKIP_TAGS.has(node.tagName)) return

    const cls = node.properties?.className
    if (Array.isArray(cls) && cls.some((c) => typeof c === "string" && SKIP_CLASSES.has(c))) return

    if (node.tagName === "img") {
      const src = node.properties?.src
      if (typeof src === "string") out.images.push(toFeedSrc(src, noteSlug, feedSlug))
      return
    }
  }

  for (const child of node.children) walk(child as Nodes, out, noteSlug, feedSlug)
}

/**
 * 信息流的排序日期，与 `dates`（来自 git，在 Cloudflare 浅克隆下对所有文件
 * 都退化成 tip commit 时间）无关。优先级：frontmatter → 文件名里的日期 → dates。
 * 文件名带日期（`2026-09-18 随手记.md`）是最省事的控制排序手段。
 */
function resolveDate(data: QuartzPluginData): Date {
  const fm = (data.frontmatter ?? {}) as Record<string, unknown>
  for (const key of ["date", "created", "modified", "published"]) {
    const v = fm[key]
    if (v instanceof Date) {
      if (!isNaN(v.getTime())) return v
    } else if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d
    }
  }

  const base = (data.relativePath ?? data.slug ?? "").split("/").pop() ?? ""
  const m = base.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/)
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
    if (!isNaN(d.getTime())) return d
  }

  return data.dates?.modified ?? data.dates?.created ?? new Date(0)
}

function isMoment(
  data: QuartzPluginData,
  slug: string,
  folderSlugs: string[],
  tagNames: Set<string>,
): boolean {
  if (slug === "index" || slug.endsWith("/index")) return false
  if ((data as { unlisted?: boolean }).unlisted === true) return false

  if (folderSlugs.some((f) => slug === f || slug.startsWith(f + "/"))) return true

  const tags = (data.frontmatter?.tags ?? []) as string[]
  return tags.some((t) => tagNames.has(t))
}

export const MomentsPageType: QuartzPageTypePlugin<Partial<MomentsOptions>> = (userOpts) => {
  const opts: MomentsOptions = { ...defaults, ...userOpts }

  return {
    name: "moments",
    priority: 1,
    // 虚拟页不会命中任何真实内容页；真实页仍由 content-page 处理
    match: match.none(),
    layout: "moments",
    body: MomentsConstructor,
    generate({
      content,
      cfg,
      ctx,
    }: {
      content: ProcessedContent[]
      cfg: GlobalConfiguration
      ctx: BuildCtx
    }): VirtualPage[] {
      const feedSlug = opts.slug as FullSlug
      const folderSlugs = opts.folders.map((f) => slugifyFilePath(f as FilePath))
      const tagNames = new Set(opts.tags)

      if (ctx.allSlugs.includes(feedSlug)) {
        console.warn(
          `[moments] 内容里已存在「${feedSlug}」这个页面，信息流虚拟页会覆盖它。建议给它换个 slug。`,
        )
      }

      const picked: { date: Date; item: MomentItem }[] = []

      for (const [tree, vfile] of content) {
        const data = vfile.data
        const slug = data.slug
        if (!slug || !isMoment(data, slug, folderSlugs, tagNames)) continue

        const date = resolveDate(data)
        const extracted: Extracted = { images: [], text: [] }
        walk(tree, extracted, slug, feedSlug)

        const full = extracted.text.join(" ").replace(/\s+/g, " ").trim()
        // 按码点切，避免把 emoji 劈成两半
        const points = [...full]
        const truncated = points.length > opts.excerptLength

        picked.push({
          date,
          item: {
            slug,
            url: resolveRelative(feedSlug, slug),
            title: (data.frontmatter?.title as string) || (slug.split("/").pop() ?? slug),
            excerpt: truncated ? points.slice(0, opts.excerptLength).join("") : full,
            truncated,
            images: extracted.images,
            date: date.toISOString(),
            displayDate: formatDate(date, cfg.locale),
          },
        })
      }

      // 倒序；同一天用 slug 兜底，保证构建可重复
      picked.sort(
        (a, b) => b.date.getTime() - a.date.getTime() || a.item.slug.localeCompare(b.item.slug),
      )

      const items = picked.slice(0, opts.limit).map((p) => p.item)
      const newest = picked[0]?.date ?? new Date(0)

      const [, vfile] = defaultProcessedContent({
        slug: feedSlug,
        text: items.map((i) => `${i.title} ${i.excerpt}`).join(" "),
        description: `${opts.title} · 随记信息流`,
        frontmatter: { title: opts.title, tags: [] },
        // 必须显式给全：Date.tsx 的 getDate() 在缺 defaultDateType 时会直接 throw
        dates: { created: newest, modified: newest, published: newest },
        defaultDateType: "modified",
        momentItems: items,
      })

      return [{ slug: feedSlug, title: opts.title, data: vfile.data }]
    },
  }
}
