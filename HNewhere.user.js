// ==UserScript==
// @name         HNewhere
// @namespace    https://github.com/twalichiewicz/HNewhere
// @version      1.4
// @description  Hacker News comments sidebar for any article
// @include      http://*
// @include      https://*
// @exclude http://localhost/*
// @exclude https://localhost/*
// @exclude      https://www.google.com/*
// @exclude      https://www.google.*/*
// @exclude      https://*.google.com/*
// @exclude      https://accounts.google.com/*
// @exclude      https://mail.google.com/*
// @exclude      https://mail.*.*/*
// @exclude      https://*.bank.com/*
// @exclude      https://*.googleusercontent.com/*
// @exclude      https://*.doubleclick.net/*
// @exclude      https://*.facebook.com/*
// @exclude      https://*.twitter.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      hacker-news.firebaseio.com
// @connect      hn.algolia.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE = {
    width: "hn_width",

    last: "hn_last",
  };

  let sidebar = null;
  let opening = false;

  // -------------------------
  // Storage
  // -------------------------

  async function save(key, value) {
    await GM.setValue(key, value);
  }

  async function load(key, fallback) {
    try {
      return await GM.getValue(key, fallback);
    } catch {
      return fallback;
    }
  }

  // -------------------------
  // Network
  // -------------------------

  function request(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",

        url: url,

        onload: function (response) {
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            resolve(null);
          }
        },

        onerror: reject,
      });
    });
  }

  async function getItem(id) {
    return request(
      "https://hacker-news.firebaseio.com/v0/item/" + id + ".json",
    );
  }

  async function findHN(url) {
    const target = normalizeURL(url);

    const queries = [url, target];

    const matches = new Map();

    for (const query of queries) {
      const result = await request(
        "https://hn.algolia.com/api/v1/search?tags=story&restrictSearchableAttributes=url&hitsPerPage=100&query=" +
          encodeURIComponent(query),
      );

      if (!result || !result.hits) continue;

      result.hits.forEach((item) => {
        if (normalizeURL(item.url) === target) {
          matches.set(item.objectID, item);
        }
      });
    }

    return [...matches.values()].sort(
      (a, b) => a.created_at_i - b.created_at_i,
    );
  }

  // -------------------------
  // Helpers
  // -------------------------

  function normalizeURL(url) {
    try {
      const u = new URL(url);

      [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
      ].forEach((param) => u.searchParams.delete(param));

      return (
        u.hostname +
        u.pathname.replace(/\/$/, "") +
        u.search
      ).toLowerCase();
    } catch {
      return "";
    }
  }

  function sanitizeHTML(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";

    template.content
      .querySelectorAll("script, iframe, object, embed")
      .forEach((el) => el.remove());

    template.content.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      }

      el.removeAttribute("style");

      for (const attr of ["href", "src"]) {
        const value = el.getAttribute(attr);

        if (value && /^(javascript|data):/i.test(value)) {
          el.removeAttribute(attr);
        }
      }
    });

    return template.innerHTML;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function timeAgo(timestamp) {
    if (!timestamp) return "";

    const seconds = Math.floor(Date.now() / 1000 - timestamp);

    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return minutes + " minutes ago";

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return hours + " hours ago";

    const days = Math.floor(hours / 24);

    return days === 1 ? "1 day ago" : days + " days ago";
  }

  // -------------------------
  // Popup helpers
  // -------------------------

  function openHNWindow(url) {
    window.open(
      url,
      "hn_popup",
      "width=760,height=700,resizable=yes,scrollbars=yes",
    );
  }

  function replyURL(comment, storyID) {
    return (
      "https://news.ycombinator.com/reply?id=" +
      comment.id +
      "&goto=item%3Fid%3D" +
      storyID +
      "%23" +
      comment.id
    );
  }

  function commentURL(storyID) {
    return "https://news.ycombinator.com/item?id=" + storyID;
  }

  // -------------------------
  // Restore button
  // -------------------------

  function createRestoreButton() {
    let button = document.getElementById("hn-restore-button");
    if (button) return button;

    button = document.createElement("button");
    button.id = "hn-restore-button";
    button.textContent = "HN";

    button.style.cssText = `
        position:fixed;
        top:12px;
        right:12px;
        z-index:2147483647;
        background:#ff6600;
        color:white;
        border:none;
        border-radius:3px;
        padding:4px 8px;
        font-family:Verdana,sans-serif;
        font-size:11px;
        font-weight:bold;
        cursor:pointer;
        box-shadow:0 1px 4px rgba(0,0,0,.25);
    `;

    document.body.appendChild(button);

    return button;
  }

  function createCollapsedButton(stories) {
    let button = document.getElementById("hn-collapse-button");
    if (button) return button;

    button = document.createElement("button");
    button.id = "hn-collapse-button";
    button.textContent = "HN";

    button.style.cssText = `
		position:fixed;
		top:12px;
		right:12px;
		z-index:2147483647;
		background:#ff6600;
		color:white;
		border:none;
		border-radius:3px;
		padding:4px 8px;
		font-family:Verdana,sans-serif;
		font-size:11px;
		font-weight:bold;
		cursor:pointer;
		box-shadow:0 1px 4px rgba(0,0,0,.25);
	`;

    button.onclick = () => {
      button.remove();
      openSidebar(stories).catch(console.error);
    };

    document.body.appendChild(button);

    return button;
  }

  // -------------------------
  // Sidebar
  // -------------------------

  async function createSidebar() {
    if (sidebar) {
      sidebar._cleanup?.();
      sidebar.remove();
      sidebar = null;
    }

    const savedWidth = await load(STORAGE.width, 420);

    const width = Math.min(Math.max(savedWidth, 280), window.innerWidth * 0.8);

    const host = document.createElement("div");
    document.body.appendChild(host);

    const shadow = host.attachShadow({
      mode: "open",
    });

    shadow.innerHTML = `
<style>

#panel {
    position:fixed;
    right:0;
    top:0;
    height:100vh;
    width:${width}px;
    min-width:280px;
    max-width:80vw;
    background:#f6f6ef;
    color:#000;
    z-index:2147483646;
    display:flex;
    flex-direction:column;
    border-left:1px solid #ccc;
    box-shadow:-3px 0 12px rgba(0,0,0,.15);
    font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    font-size:13px;
}

header {
    background:#ff6600;
    color:black;
    padding:6px 8px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    font-weight:bold;
}

header button {
    background:none;
    border:0;
    color:black;
    cursor:pointer;
    font-size:16px;
}

.submission {
    margin:16px 0;
    padding-top:12px;
    border-top:1px solid #ccc;
}

.submission-header {
    font-size:11px;
    color:#828282;
    margin-bottom:8px;
}

#comments {
    overflow:auto;
    overflow-x:hidden;
    padding:8px 12px;
    word-wrap:break-word;
}

.comment {
    margin:12px 0 12px 15px;
    max-width:100%;
    overflow-wrap:anywhere;
}

.top-level-comments > .comment {
    margin-left:0;
}

.text {
    margin-top:4px;
    line-height:132%;
    font-weight:normal;
}

.text p {
    margin:8px 0;
}

.text a {
    color:#0000aa;
}

.meta {
    color:#828282;
    font-size:10px;
}

.meta a {
    color:#828282;
    text-decoration:none;
}

.meta a:hover {
    text-decoration:underline;
}

.toggle {
    cursor:pointer;
}

.hidden {
    display:none;
}

.story-title {
    font-size:15px;
}

.story-title a {
    color:#000;
    text-decoration:none;
}

.story-meta {
    color:#828282;
    font-size:10px;
    line-height:1.4;
}

.story-actions {
    margin-top:8px;
}

.story-actions button {
    font-family:Verdana, Geneva, sans-serif;
    font-size:11px;
    cursor:pointer;
}

</style>

<div id="panel">

<header>

<span>
<b>HN</b>ewhere
</span>

<button id="minimize">
−
</button>

</header>

<div id="comments">
Loading...
</div>

</div>
`;

    const panel = shadow.querySelector("#panel");

    let resizing = false;
    let startX = 0;
    let startWidth = 0;

    panel.addEventListener("mousemove", (e) => {
      if (e.offsetX < 8) {
        panel.style.cursor = "col-resize";
      } else if (!resizing) {
        panel.style.cursor = "default";
      }
    });

    panel.addEventListener("mouseleave", () => {
      if (!resizing) {
        panel.style.cursor = "default";
      }
    });

    panel.addEventListener("mousedown", (e) => {
      if (e.offsetX >= 8) return;

      resizing = true;
      startX = e.clientX;
      startWidth = panel.offsetWidth;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      e.preventDefault();
    });

    let resizeTimer;

    const onMouseMove = (e) => {
      if (!resizing) return;

      const delta = startX - e.clientX;

      const newWidth = Math.min(
        Math.max(startWidth + delta, 280),
        window.innerWidth * 0.8,
      );

      panel.style.width = newWidth + "px";

      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        if (!destroyed) {
          save(STORAGE.width, newWidth);
        }
      }, 250);
    };

    const onMouseUp = () => {
      if (!resizing) return;

      resizing = false;

      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      panel.style.cursor = "default";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    let destroyed = false;

    host._cleanup = () => {
      destroyed = true;
      clearTimeout(resizeTimer);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    shadow.querySelector("#minimize").onclick = () => {
      host.style.display = "none";

      const restore = createRestoreButton();

      restore.onclick = () => {
        host.style.display = "block";
        restore.remove();
      };
    };

    document
      .querySelectorAll("#hn-restore-button, #hn-collapse-button")
      .forEach((button) => button.remove());

    sidebar = host;

    return {
      shadow,
      body: shadow.querySelector("#comments"),
    };
  }

  // -------------------------
  // Story rendering
  // -------------------------

  function renderStory(story, container) {
    const url = story.url || "https://news.ycombinator.com/item?id=" + story.id;

    container.innerHTML = `

<div class="story">


<div class="story-title">

<a target="_blank"
href="${escapeHTML(url)}">

${escapeHTML(story.title)}

</a>
</div>

<div class="story-meta">

${story.score || 0} points by

${escapeHTML(story.by || "")}

|

${timeAgo(story.time)}
</div>

<div class="story-actions">

<button type="submit" class="add-comment">
add comment
</button>

</div>
</div>

<br>

`;

    container.querySelector(".add-comment").onclick = () => {
      openHNWindow(commentURL(story.id));
    };
  }

  // -------------------------
  // Comment rendering
  // -------------------------

  async function renderComment(id, container, storyID) {
    const comment = await getItem(id);

    if (!comment || comment.deleted || comment.dead) return;

    const div = document.createElement("div");

    div.className = "comment";

    const replies = comment.kids || [];

    const reply = replyURL(comment, storyID);

    div.innerHTML = `

<div class="meta">


<a target="_blank"
href="https://news.ycombinator.com/user?id=${encodeURIComponent(comment.by || "")}">

${escapeHTML(comment.by || "anonymous")}

</a>


${timeAgo(comment.time)}

|

<a class="reply-link"
href="#">
reply
</a>

<span class="toggle">
[–]
</span>
</div>

<div class="text">
<div class="children">
${sanitizeHTML(comment.text) || ""}
</div>
</div>

`;

    container.appendChild(div);

    const children = div.querySelector(".children");

    const toggle = div.querySelector(".toggle");

    toggle.onclick = () => {
      children.classList.toggle("hidden");

      toggle.textContent = children.classList.contains("hidden")
        ? "[+]"
        : "[–]";
    };

    const replyButton = div.querySelector(".reply-link");

    replyButton.onclick = function (event) {
      event.preventDefault();

      openHNWindow(reply);
    };

    for (let i = 0; i < replies.length; i++) {
      await renderComment(replies[i], children, storyID);

      if (i > 0 && i % 10 === 0) {
        await new Promise(requestAnimationFrame);
      }
    }
  }

  // -------------------------
  // Discussion loading
  // -------------------------

  async function loadDiscussion(stories, ui) {
    ui.body.innerHTML = "";

    for (const summary of stories) {
      const story = await getItem(summary.objectID);

      if (!story) continue;

      const section = document.createElement("div");

      section.className = "submission";

      ui.body.appendChild(section);

      const header = document.createElement("div");

      header.className = "submission-header";

      header.textContent =
        "Submitted " + timeAgo(story.time);

      section.appendChild(header);

      renderStory(story, section);

      const comments = document.createElement("div");

      comments.className = "top-level-comments";

      section.appendChild(comments);

      for (const child of story.kids || []) {
        await renderComment(child, comments, story.id);
      }
    }
  }

  // -------------------------
  // Open sidebar
  // -------------------------

  async function openSidebar(stories) {
    if (opening) return;

    opening = true;

    try {
      const ui = await createSidebar();
      await loadDiscussion(id, ui);
    } catch (e) {
      console.error(e);
    } finally {
      opening = false;
    }
  }

  // -------------------------
  // Hacker News click tracking
  // -------------------------

  function setupHNListener() {
    document.addEventListener(
      "click",
      async function (event) {
        try {
          const link = event.target.closest("a");
          if (!link) return;
          const row = link.closest("tr.athing");
          if (!row) return;
          if (!link.closest(".titleline")) return;
          const id = row.id;
          if (!id) return;

          console.log("Saving HN story:", id, link.href);

          save(STORAGE.last, {
            url: link.href,
            ids: [id],
            timestamp: Date.now(),
          }).catch(console.error);
        } catch (e) {
          console.error("Failed saving HN story:", e);
        }
      },
      true,
    );
  }

  // -------------------------
  // URL helpers
  // -------------------------

  function sameURL(a, b) {
    return normalizeURL(a) === normalizeURL(b);
  }

  // -------------------------
  // Initialization
  // -------------------------

  async function init() {
    console.log("HNewhere sidebar loaded", location.href);

    // On HN, only record clicked stories.
    if (location.hostname === "news.ycombinator.com") {
      setupHNListener();
      return;
    }

    // Check if we arrived here by clicking
    // a story from Hacker News.
    let last = await load(STORAGE.last, null);

    if (last && Date.now() - last.timestamp > 60000) {
      await save(STORAGE.last, null);
      last = null;
    }

    console.log("Stored HN click:", last);
    console.log("Current URL:", location.href);
    console.log("Same URL:", last && sameURL(last.url, location.href));
    console.log("Age:", last ? Date.now() - last.timestamp : null);

    if (
      last &&
      sameURL(last.url, location.href) &&
      Date.now() - last.timestamp < 60000
    ) {
      console.log("Opening HN discussion from click:", last.id);

      await save(STORAGE.last, null);

      await openSidebar(
        last.ids || [last.id]
      );

      return;
    }

    // Otherwise, silently check if this URL
    // already has an HN discussion.
    const stories = await findHN(location.href);

    if (stories.length) {
      console.log(
        "Found HN discussions:",
        stories.map((s) => s.objectID),
      );

      createCollapsedButton(stories);
    }
  }

  init().catch(console.error);
})();
