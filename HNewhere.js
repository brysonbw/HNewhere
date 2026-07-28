// ==UserScript==
// @name         HNewhere
// @namespace    https://github.com/twalichiewicz/HNewhere
// @version      1.3
// @description  Hacker News comments sidebar for any article
// @match        https://news.ycombinator.com/*
// @include      http://*
// @include      https://*
// @exclude      https://www.google.com/*
// @exclude      https://www.google.*/*
// @exclude      https://*.google.com/*
// @exclude      https://accounts.google.com/*
// @exclude      https://mail.google.com/*
// @exclude      https://mail.*.*/*
// @exclude      https://*.bank.com/*
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

  // -------------------------
  // Storage
  // -------------------------

  async function save(key, value) {
    await GM.setValue(key, JSON.stringify(value));
  }

  async function load(key, fallback) {
    try {
      const value = await GM.getValue(key);
      return value ? JSON.parse(value) : fallback;
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
    const result = await request(
      "https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(url),
    );

    if (!result || !result.hits) return null;

    const target = normalizeURL(url);

    const exact = result.hits.find((item) => normalizeURL(item.url) === target);

    return exact ? exact.objectID : null;
  }

  // -------------------------
  // Helpers
  // -------------------------

  function normalizeURL(url) {
    try {
      const u = new URL(url);

      return (u.hostname + u.pathname.replace(/\/$/, "")).toLowerCase();
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
    let button = document.getElementById("hn-mini-button");

    if (button) return button;

    button = document.createElement("button");
    button.id = "hn-mini-button";
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

  function createCollapsedButton(id) {
    let button = document.getElementById("hn-mini-button");

    if (button) return button;

    button = document.createElement("button");

    button.id = "hn-mini-button";

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
      openSidebar(id);
    };

    document.body.appendChild(button);

    return button;
  }

  // -------------------------
  // Sidebar
  // -------------------------

  async function createSidebar() {
    if (sidebar) sidebar.remove();

    const host = document.createElement("div");

    document.body.appendChild(host);

    const shadow = host.attachShadow({
      mode: "open",
    });

    const width = await load(STORAGE.width, 420);

    shadow.innerHTML = `

<style>

#panel {
    position:fixed;
    right:0;
    top:0;
    height:100vh;
    width:${width}px;
    background:#f6f6ef;
    color:#000;
    z-index:2147483647;
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

#comments {
    overflow:auto;
    overflow-x:hidden;
    padding: 8px 12px;
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

    panel.addEventListener("click", (e) => {
      if (e.offsetX >= 8) return;

      resizing = true;

      startX = e.clientX;
      startWidth = panel.offsetWidth;

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (!resizing) return;

      const delta = startX - e.clientX;
      const newWidth = startWidth + delta;

      panel.style.width = newWidth + "px";
      save(STORAGE.width, newWidth).catch(console.error);
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

    shadow.querySelector("#minimize").onclick = () => {
      host.style.display = "none";

      const restore = createRestoreButton();

      restore.onclick = () => {
        host.style.display = "block";

        restore.remove();
      };
    };

    if (sidebar) sidebar.remove();

    const oldButton = document.getElementById("hn-mini-button");

    if (oldButton) oldButton.remove();

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

  function renderComment(id, container, storyID) {
    return getItem(id).then((comment) => {
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

      for (const child of replies) {
        renderComment(child, children, storyID);
      }
    });
  }

  // -------------------------
  // Discussion loading
  // -------------------------

  async function loadDiscussion(id, ui) {
    const story = await getItem(id);

    if (!story) {
      ui.body.textContent = "Unable to load HN discussion.";
      return;
    }

    renderStory(story, ui.body);

    const comments = document.createElement("div");

    comments.className = "top-level-comments";

    ui.body.appendChild(comments);

    const kids = story.kids || [];

    for (const child of kids) {
      await renderComment(child, comments, story.id);
    }
  }

  // -------------------------
  // Open sidebar
  // -------------------------

  async function openSidebar(id) {
    const ui = await createSidebar();

    await loadDiscussion(id, ui);
  }

  // -------------------------
  // Hacker News click tracking
  // -------------------------

  function setupHNListener() {
    document.addEventListener(
      "click",
      async function (event) {
        const link = event.target.closest("a");

        if (!link) return;

        const row = link.closest("tr.athing");

        if (!row) return;

        if (!link.closest(".titleline")) return;

        const id = row.id;

        if (!id) return;

        console.log("Saving HN story:", id, link.href);

        await save(STORAGE.last, {
          url: link.href,
          id: id,
          timestamp: Date.now(),
        });
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
    const last = await load(STORAGE.last, null);

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

      await openSidebar(last.id);

      return;
    }

    // Otherwise, silently check if this URL
    // already has an HN discussion.
    const id = await findHN(location.href);

    if (id) {
      console.log("Found HN discussion:", id);

      createCollapsedButton(id);
    }
  }

  init();
})();
