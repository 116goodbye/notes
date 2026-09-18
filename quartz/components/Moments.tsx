import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug } from "../util/path"

/** 信息流里的一条。路径类字段在构建期就已经算成「相对 feed 页」的地址，组件里不再做任何换算。 */
export type MomentItem = {
  slug: FullSlug
  /** 从 feed 页指向这篇笔记的相对地址 */
  url: string
  title: string
  excerpt: string
  truncated: boolean
  /** 已转成 feed 页相对地址，可直接塞进 <img src> */
  images: string[]
  /** ISO 时间，给 <time datetime> 用 */
  date: string
  /** 已按 cfg.locale 本地化，如「2026年9月18日」 */
  displayDate: string
}

declare module "vfile" {
  interface DataMap {
    momentItems?: MomentItem[]
  }
}

const Moments: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const items = fileData.momentItems ?? []
  const title = fileData.frontmatter?.title ?? "动态"

  return (
    <div class="moments">
      <header class="moments-head">
        <h1 class="moments-title">{title}</h1>
        <p class="moments-sub">随记 · 共 {items.length} 条</p>
      </header>
      {items.length === 0 ? (
        <p class="moments-empty">
          还没有随记。在 vault 的 <code>随记/</code> 文件夹里写一篇，发布后就会出现在这里。
        </p>
      ) : (
        <ol class="moments-list">
          {items.map((it) => (
            <li class="moment" key={it.slug}>
              <p class="moment-text">
                {it.excerpt}
                {it.truncated ? "…" : ""}
              </p>

              {it.truncated && (
                <a class="moment-more internal" href={it.url}>
                  全文
                </a>
              )}

              {it.images.length > 0 && (
                <div class="moment-media" data-count={Math.min(it.images.length, 9)}>
                  {it.images.map((src, i) => (
                    <img src={src} alt="" loading="lazy" decoding="async" key={`${it.slug}-${i}`} />
                  ))}
                </div>
              )}

              <div class="moment-meta">
                <time datetime={it.date}>{it.displayDate}</time>
                <a class="moment-src internal" href={it.url}>
                  {it.title}
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default (() => Moments) satisfies QuartzComponentConstructor
