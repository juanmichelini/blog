// Zero-dependency static site generator.
// Reads content/posts/*.md and writes a static site to dist/.
//   node build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

const stripTags = (html) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("Missing frontmatter");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

// ---------- minimal markdown ----------
// Supports: paragraphs, #-headings, > quotes, -/1. lists, ``` code fences,
// ![img](src), [links](url), **bold**, *italic*, `code`, and raw HTML blocks
// (iframes etc.). Content is trusted (it is your own writing).
function inline(text) {
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${esc(alt)}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
}

function markdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const blank = (l) => l.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (line.startsWith("<")) { // raw HTML block, runs until blank line
      const buf = [];
      while (i < lines.length && !blank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join("\n"));
      continue;
    }

    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    const li = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^(\s*)([-*]|\d+\.)\s+/, ""));
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }

    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      out.push(`<figure><img src="${img[2]}" alt="${esc(img[1])}" loading="lazy"></figure>`);
      i++;
      continue;
    }

    const buf = [];
    while (i < lines.length && !blank(lines[i]) && !/^(#{1,6}\s|>|```|<)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join("\n"))}</p>`);
  }
  return out.join("\n");
}

// ---------- load posts ----------
const posts = readdirSync(join(ROOT, "content/posts"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const { meta, body } = parseFrontmatter(readFileSync(join(ROOT, "content/posts", f), "utf8"));
    const html = markdown(body);
    const slug = f.replace(/\.md$/, "");
    const firstPara = html.match(/<p>([\s\S]*?)<\/p>/);
    let description = firstPara ? stripTags(firstPara[1]) : site.tagline;
    if (description.length > 180) description = description.slice(0, 180).replace(/\s+\S*$/, "") + "…";
    return { slug, title: meta.title, date: meta.date, updated: meta.updated || meta.date, html, description };
  })
  .sort((a, b) => new Date(b.date) - new Date(a.date));

// ---------- templates ----------
const hasFavicon = existsSync(join(ROOT, "public/favicon.png"));

function page({ title, description, path, body, type = "website" }) {
  const url = site.url + path;
  const fullTitle = path === "/" ? site.title : `${title} – ${site.title}`;
  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
${hasFavicon ? '<link rel="icon" href="/favicon.png">' : ""}
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="wrap">
<header>
<a class="site-title" href="/">${esc(site.author)}</a>
<span class="tagline">${esc(site.tagline)}</span>
</header>
<main>
${body}
</main>
<footer>
<h2>About</h2>
<p>${inline(site.about)}</p>
</footer>
</div>
</body>
</html>
`;
}

const write = (rel, content) => {
  const file = join(DIST, rel);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
};

// ---------- build ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(join(ROOT, "public"), DIST, { recursive: true });
cpSync(join(ROOT, "style.css"), join(DIST, "style.css"));

write(
  "index.html",
  page({
    title: site.title,
    description: site.tagline,
    path: "/",
    body: `<ul class="posts">
${posts
  .map(
    (p) =>
      `<li><a href="/${p.slug}/">${esc(p.title)}</a><time datetime="${p.date}">${fmtDate(p.date)}</time></li>`
  )
  .join("\n")}
</ul>`,
  })
);

for (const p of posts) {
  write(
    `${p.slug}/index.html`,
    page({
      title: p.title,
      description: p.description,
      path: `/${p.slug}/`,
      type: "article",
      body: `<article>
<div class="post-head">
<h1>${esc(p.title)}</h1>
<p class="meta"><time datetime="${p.date}">${fmtDate(p.date)}</time></p>
</div>
<div class="content">
${p.html}
</div>
</article>
<p class="back"><a href="/">← All posts</a></p>`,
    })
  );
}

write(
  "404.html",
  page({
    title: "Not found",
    description: "Page not found",
    path: "/404.html",
    body: `<h1>Not found</h1><p>That page doesn’t exist. <a href="/">Back to the posts</a>.</p>`,
  })
);

const rfc822 = (iso) => new Date(iso).toUTCString();
write(
  "feed.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(site.title)}</title>
<link>${site.url}/</link>
<description>${esc(site.tagline)}</description>
<language>${site.lang}</language>
<atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
${posts
  .map(
    (p) => `<item>
<title>${esc(p.title)}</title>
<link>${site.url}/${p.slug}/</link>
<guid isPermaLink="true">${site.url}/${p.slug}/</guid>
<pubDate>${rfc822(p.date)}</pubDate>
<description>${esc(p.description)}</description>
<content:encoded><![CDATA[${p.html.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
</item>`
  )
  .join("\n")}
</channel>
</rss>
`
);

write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${site.url}/</loc></url>
${posts
  .map((p) => `<url><loc>${site.url}/${p.slug}/</loc><lastmod>${p.updated.slice(0, 10)}</lastmod></url>`)
  .join("\n")}
</urlset>
`
);

write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

// ---------- sanity checks ----------
const missing = [];
for (const p of posts) {
  for (const m of p.html.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
    if (!existsSync(join(DIST, m[1]))) missing.push(`${m[1]} (used in ${p.slug})`);
  }
}
console.log(`Built ${posts.length} posts → dist/`);
if (missing.length) {
  console.warn("\nWARNING: missing local files:\n  " + missing.join("\n  "));
}
